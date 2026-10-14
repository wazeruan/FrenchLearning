/* Speech recognition worker: runs Whisper (base) fully offline with transformers.js.
   Model and runtime files are local (see scripts/setup-speech.sh); remote downloads are disabled.
   The encoder (the slow part) runs on the GPU via WebGPU when available (~0.6 s per word on an M-series Mac);
   otherwise everything runs on WASM on one CPU thread (much slower, ~10 s per word). */
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, env } from '../vendor/transformers/transformers.min.js';

const root = new URL('../', import.meta.url).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = root + 'models/';
env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = root + 'vendor/transformers/';
env.backends.onnx.wasm.numThreads = 1; // nested thread workers are not reliable in every browser

const MODEL = 'onnx-community/whisper-base';
// Whisper control tokens (see the model's added_tokens.json).
const T = { startOfPrev: 50361, startOfTranscript: 50258, fr: 50265, transcribe: 50359, noTimestamps: 50363 };

let loading = null;
const progress = (p) => { if (p.status === 'progress') postMessage({ type: 'progress', file: p.file, progress: p.progress }); };

// ?backend=wasm on the worker URL forces the CPU path (useful for troubleshooting).
const FORCE_WASM = new URL(self.location.href).searchParams.get('backend') === 'wasm';
async function hasWebGPU() {
  if (FORCE_WASM) return false;
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { return false; }
}
async function loadModel() {
  if (await hasWebGPU()) {
    try {
      const model = await WhisperForConditionalGeneration.from_pretrained(MODEL, {
        // fp32 encoder: the fp16/int8 variants give wrong output on WebGPU (tested on Apple GPUs).
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        device: { encoder_model: 'webgpu', decoder_model_merged: 'wasm' },
        progress_callback: progress,
      });
      return { model, backend: 'webgpu' };
    } catch (e) { /* fall back to WASM below */ }
  }
  const model = await WhisperForConditionalGeneration.from_pretrained(MODEL, {
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    device: 'wasm',
    progress_callback: progress,
  });
  return { model, backend: 'wasm' };
}
function load() {
  loading ??= Promise.all([AutoProcessor.from_pretrained(MODEL), AutoTokenizer.from_pretrained(MODEL), loadModel()])
    .then(([processor, tokenizer, { model, backend }]) => ({ processor, tokenizer, model, backend }))
    .catch((err) => { loading = null; throw err; });
  return loading;
}

// `hint` is a short list of the lesson's vocabulary, given to Whisper as preceding context.
// It nudges recognition toward course words without forcing the target word.
async function transcribe(audio, hint) {
  const { processor, tokenizer, model } = await load();
  const { input_features } = await processor(audio);
  const prompt = hint ? tokenizer.encode(' ' + hint, { add_special_tokens: false }).slice(-100) : [];
  const init = (prompt.length ? [T.startOfPrev, ...prompt] : []).concat([T.startOfTranscript, T.fr, T.transcribe, T.noTimestamps]);
  const out = await model.generate({ inputs: input_features, decoder_input_ids: init, max_new_tokens: 32 });
  const ids = out.tolist()[0].map(Number).slice(init.length);
  return tokenizer.decode(ids, { skip_special_tokens: true }).trim();
}

// One job at a time: ONNX sessions must not run two generations concurrently.
// A newer "supersede" request makes older queued ones pointless; they are skipped instead of run.
let queue = Promise.resolve();
let newest = 0;
self.onmessage = ({ data }) => {
  if (data.type === 'transcribe' && data.supersede) newest = Math.max(newest, data.id);
  queue = queue.then(() => handle(data));
};
async function handle(data) {
  try {
    if (data.type === 'load') {
      const { backend } = await load();
      postMessage({ type: 'ready', backend });
    } else if (data.type === 'transcribe' && data.supersede && data.id < newest) {
      postMessage({ type: 'error', id: data.id, message: 'superseded' });
    } else if (data.type === 'transcribe') {
      postMessage({ type: 'result', id: data.id, text: await transcribe(data.audio, data.hint) });
    }
  } catch (err) {
    postMessage({ type: 'error', id: data.id, message: String((err && err.message) || err) });
  }
}
