# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#     "huggingface_hub",
#     "mlx-whisper",
#     "num2words",
#     "moshi_mlx==0.2.12",
#     "numpy",
# ]
# ///
# Offline French TTS with Kyutai TTS 1.6B (en/fr), MLX build for Apple Silicon.
# Loads the model once and renders a batch of clips to WAV (24 kHz mono). Sampling is random and
# a take can drop or slur a word, so each take is transcribed with Whisper (small) and retried
# until it matches the text; the best take is kept. Based on kyutai-labs/delayed-streams-modeling
# scripts/tts_mlx.py.
#
# Usage:
#   uv run scripts/kyutai-tts.py JOBS.json OUT_DIR [--voice cml-tts/fr/<name>.wav] [--tries 4]
#   uv run scripts/kyutai-tts.py --list-voices
# JOBS.json: [{"id": "u01-01", "text": "bonjour", "voice": "..."}, ...]
#   -> OUT_DIR/<id>.wav and OUT_DIR/<id>.json (what Whisper heard, score, attempts).
# Clips already in OUT_DIR are skipped, so an interrupted run resumes.
# Weights download once to the Hugging Face cache; after that it runs with no network.
import argparse
import difflib
import json
import re
import unicodedata
import sys
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
import sentencepiece
import sphn
from moshi_mlx import models
from moshi_mlx.models.tts import DEFAULT_DSM_TTS_REPO, DEFAULT_DSM_TTS_VOICE_REPO, TTSModel
from moshi_mlx.utils.loaders import hf_get

DEFAULT_VOICE = "cml-tts/fr/10087_11650_000028-0002_enhanced.wav"  # plain (non-enhanced) clips garbled some lines in tests


def load(hf_repo, voice_repo, quantize, temp=0.6):
    raw_config = hf_get("config.json", hf_repo)
    with open(hf_get(raw_config), "r") as f:
        raw_config = json.load(f)
    mimi_weights = hf_get(raw_config["mimi_name"], hf_repo)
    moshi_weights = hf_get(raw_config.get("moshi_name", "model.safetensors"), hf_repo)
    tokenizer = hf_get(raw_config["tokenizer_name"], hf_repo)
    lm_config = models.LmConfig.from_config_dict(raw_config)
    lm_config.transformer.max_seq_len = lm_config.transformer.context  # moshi_mlx <= 0.3.0 kv-cache bug
    model = models.Lm(lm_config)
    model.set_dtype(mx.bfloat16)
    model.load_pytorch_weights(str(moshi_weights), lm_config, strict=True)
    if quantize is not None:
        nn.quantize(model.depformer, bits=quantize)
        for layer in model.transformer.layers:
            nn.quantize(layer.self_attn, bits=quantize)
            nn.quantize(layer.gating, bits=quantize)
    text_tokenizer = sentencepiece.SentencePieceProcessor(str(tokenizer))
    mimi = models.mimi.Mimi(models.mimi_202407(lm_config.generated_codebooks))
    mimi.load_pytorch_weights(str(mimi_weights), strict=True)
    return TTSModel(
        model, mimi, text_tokenizer, voice_repo=voice_repo,
        temp=temp, cfg_coef=1, max_padding=8, initial_padding=2, final_padding=2,
        padding_bonus=0, raw_config=raw_config,
    )


def synth(tts, text, voice):
    cfg_cond = getattr(tts, "cfg_cond", None)  # set once in main(): CFG-distilled models take it as a condition
    no_text = no_prefix = cfg_cond is None
    entries = [tts.prepare_script([text])]
    voices = [tts.get_voice_path(voice)] if tts.multi_speaker else []
    attrs = [tts.make_condition_attributes(voices, cfg_cond)]
    pcm = []

    def on_frame(frame):
        if (frame == -1).any():
            return
        out = tts.mimi.decode_step(frame[:, :, None])
        pcm.append(np.array(mx.clip(out[0, 0], -1, 1)))

    # Start every take from a clean state: the LM keeps its KV cache on the model object and
    # moshi_mlx only resets it in warmup(), so without this each clip continues the previous ones
    # and soon speaks the wrong words.
    for c in tts.lm.transformer_cache:
        c.reset()
    for c in tts.lm.depformer_cache:
        c.reset()
    tts.mimi.reset_state()
    tts.generate(entries, attrs, cfg_is_no_prefix=no_prefix, cfg_is_no_text=no_text, on_frame=on_frame)
    return np.concatenate(pcm, -1)


ASR_REPO = "mlx-community/whisper-small-mlx"


def transcribe(wav, sr):
    """What Whisper hears in a clip (French), as plain text."""
    import mlx_whisper
    x = np.asarray(wav, dtype=np.float32).reshape(-1)
    n = int(len(x) * 16000 / sr)  # Whisper wants 16 kHz
    x16 = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    # No silence padding: tested, it makes Whisper invent extra words ("le chien" -> "C'est le chien").
    r = mlx_whisper.transcribe(x16, path_or_hf_repo=ASR_REPO, language="fr",
                               temperature=0.0, condition_on_previous_text=False, verbose=None)
    return r["text"].strip()


def norm(s):
    from num2words import num2words
    s = unicodedata.normalize("NFC", s.lower()).replace("’", "'")
    minutes = {"15": " heures et quart", "30": " heures et demie", "00": " heures", "": " heures"}
    s = re.sub(r"(\d+)\s*h\s*(\d{2})?\b", lambda m: m.group(1) + minutes.get(m.group(2) or "", " heures " + (m.group(2) or "")), s)  # "8h15"
    s = re.sub(r"\d+", lambda m: " " + num2words(int(m.group()), lang="fr") + " ", s)  # Whisper writes "45" for "quarante-cinq"
    s = re.sub(r"[^\w' -]", " ", s)
    return " ".join(s.replace("-", " ").split())


def sounds(s):
    """A rough pronunciation key, so words that sound alike match (fatigué / fatiguée, a / à, payer / payez)."""
    s = unicodedata.normalize("NFD", norm(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    words = []
    for w in s.replace("'", " ").split():
        w = re.sub(r"e+$", "e", w)  # fatiguee -> fatigue
        w = re.sub(r"(er|ez|et|ai|ait|aient|ais)$", "e", w)
        w = re.sub(r"(es|e|s|x|t|d|z|nt)$", "", w) or w  # silent endings
        words.append(w.replace("ph", "f").replace("qu", "k").replace("h", ""))
    return " ".join(words)


def score(text, heard):
    """0-1 similarity of the intended text and Whisper's transcript: the better of spelling
    (ignoring case and punctuation, digits spelled out) and rough pronunciation."""
    spelled = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
    spoken = difflib.SequenceMatcher(None, sounds(text), sounds(heard)).ratio()
    return max(spelled, spoken)


def rescore(jobs, out):
    """Re-check finished clips with the current checker, without rendering anything."""
    for n, job in enumerate(jobs, 1):
        wav_path, rep_path = out / f"{job['id']}.wav", out / f"{job['id']}.json"
        if not wav_path.exists():
            continue
        x, sr = sphn.read(str(wav_path))
        heard = transcribe(x, sr)
        rep = json.loads(rep_path.read_text(encoding="utf-8")) if rep_path.exists() else {"id": job["id"], "attempts": None}
        rep.update({"key": job.get("key"), "text": job["text"], "heard": heard, "score": score(job["text"], heard)})
        rep_path.write_text(json.dumps(rep, ensure_ascii=False), encoding="utf-8")
        print(f"[{n}/{len(jobs)}] {job['id']}: score {rep['score']:.2f}  {job['text']!r} -> {heard!r}", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("jobs", nargs="?")
    p.add_argument("out_dir", nargs="?")
    p.add_argument("--hf-repo", default=DEFAULT_DSM_TTS_REPO)
    p.add_argument("--voice-repo", default=DEFAULT_DSM_TTS_VOICE_REPO)
    p.add_argument("--voice", default=DEFAULT_VOICE)
    p.add_argument("--quantize", type=int)
    p.add_argument("--temp", type=float, default=0.6)
    p.add_argument("--tries", type=int, default=4,
                   help="takes per clip; each is checked with Whisper and the best is kept (1 = no check)")
    p.add_argument("--min-score", type=float, default=0.95,
                   help="stop retrying once Whisper's transcript matches the text this well (0-1)")
    p.add_argument("--list-voices", action="store_true")
    p.add_argument("--rescore", action="store_true", help="re-check clips already in OUT_DIR; render nothing")
    a = p.parse_args()

    if a.list_voices:
        from huggingface_hub import list_repo_files
        for f in list_repo_files(a.voice_repo):
            if f.startswith("cml-tts/fr/") and f.endswith(".wav"):
                print(f)
        return
    if not (a.jobs and a.out_dir):
        p.error("JOBS.json and OUT_DIR are required")

    jobs = json.loads(Path(a.jobs).read_text(encoding="utf-8"))
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if a.rescore:
        return rescore(jobs, out)
    todo = [j for j in jobs if not (out / f"{j['id']}.wav").exists()]  # resume: finished clips are kept
    if len(todo) < len(jobs):
        print(f"{len(jobs) - len(todo)} clips already done, {len(todo)} to go", file=sys.stderr)
    mx.random.seed(299792458)
    t0 = time.time()
    tts = load(a.hf_repo, a.voice_repo, a.quantize, a.temp)
    tts.cfg_cond = None
    if tts.valid_cfg_conditionings:  # trained with CFG distillation
        tts.cfg_cond, tts.cfg_coef = tts.cfg_coef, 1.0
    sr = tts.mimi.sample_rate
    print(f"model loaded in {time.time() - t0:.1f}s", file=sys.stderr)
    for n, job in enumerate(todo, 1):
        t = time.time()
        voice = job.get("voice", a.voice)
        best = None  # (score, wav, heard, attempt)
        for attempt in range(1, a.tries + 1):
            wav = synth(tts, job["text"], voice)
            if a.tries == 1:
                best = (None, wav, None, 1)
                break
            heard = transcribe(wav, sr)
            s = score(job["text"], heard)
            if best is None or s > best[0]:
                best = (s, wav, heard, attempt)
            if s >= a.min_score:
                break
        s, wav, heard, attempt = best
        # Write the report first and the clip last (atomically), so a finished .wav always has its report.
        (out / f"{job['id']}.json").write_text(json.dumps(
            {"id": job["id"], "key": job.get("key"), "text": job["text"], "voice": voice, "heard": heard,
             "score": s, "attempts": attempt}, ensure_ascii=False), encoding="utf-8")
        part = out / f"{job['id']}.part.wav"
        sphn.write_wav(str(part), wav, sr)
        part.rename(out / f"{job['id']}.wav")
        flag = "" if s is None or s >= a.min_score else "  << CHECK"
        sc = "" if s is None else f" score {s:.2f} (try {attempt})"
        print(f"[{n}/{len(todo)}] {job['id']}: {wav.shape[-1] / sr:.2f}s in {time.time() - t:.1f}s{sc}"
              f"  {job['text']!r}{'' if heard is None else ' -> ' + repr(heard)}{flag}", file=sys.stderr)


if __name__ == "__main__":
    main()
