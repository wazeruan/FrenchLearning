// Generates French audio for the course, converted to AAC (.m4a). Two engines, both offline on this Mac:
//   - macOS `say` with the Canadian French voice Amélie, for short lines (one or two words, which
//     neural TTS tends to garble) and for any clip whose manifest entry already says "say:" (lines
//     picked by ear or by Whisper because the neural take was doubtful);
//   - Kyutai TTS 1.6B (scripts/kyutai-tts.py) for everything else.
// Clip ids:
//   <item>.m4a / <item>-ex.m4a    word and example sentence (default voice)
//   <unit>-x<n>.m4a               grammar examples
//   <unit>-d<n>.m4a               drill sentences with the answer filled in
//   <unit>-l<n>.m4a               dialogue lines, in each speaker's voice
// Each take is checked with Whisper and retried if it doesn't match the text; clips that still
// don't match after every take are listed at the end, to listen to. assets/audio/manifest.json
// records the voice and text of every clip, so a clip is rebuilt whenever either changes.
// Rendering takes ~15-30 s a clip; an interrupted run resumes where it stopped.
// To move a clip to Amélie (woman's role only), set its manifest entry to "say:" and run this script.
// Usage: node scripts/generate-audio.mjs [--force]   (Kyutai needs uv; first run downloads ~4 GB of weights)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = createRequire(import.meta.url)(join(root, 'js/data.js'));
const core = createRequire(import.meta.url)(join(root, 'js/core.js'));
const outDir = join(root, 'assets/audio');
const tmpDir = join(root, '.tmp');
const manifestPath = join(outDir, 'manifest.json');
const force = process.argv.includes('--force');
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });
// Before the first manifest existed, clips on disk are trusted; afterwards only recorded ones are.
const legacy = !existsSync(manifestPath);
const manifest = legacy ? {} : JSON.parse(readFileSync(manifestPath, 'utf8'));

// Voice roles used in js/data.js -> Kyutai voice embeddings (French CML-TTS speakers, CC BY 4.0).
const VOICES = {
  femme: 'cml-tts/fr/10087_11650_000028-0002_enhanced.wav',
  homme: 'cml-tts/fr/1406_1028_000009-0003_enhanced.wav',
};
const TEMP = 0.6;
// macOS voices for the `say` engine, by role. Only the woman's role has a good Canadian French voice.
const SAY_VOICES = { femme: 'Amélie' };
const isShort = (text) => text.replace(/'/g, ' ').split(/\s+/).filter(Boolean).length <= 2 && !/[.!?]\s*$/.test(text);
const useSay = ([id, text, role]) => !!SAY_VOICES[role] && (isShort(text) || (manifest[id] || '').startsWith('say:'));
const voiceKey = (role) => {
  if (!VOICES[role]) throw new Error(`Unknown voice role "${role}" (known: ${Object.keys(VOICES).join(', ')})`);
  return `kyutai:${VOICES[role].split('/').pop().replace(/\.wav$/, '')}`;
};

const jobs = [];
for (const unit of data.units) {
  for (const item of unit.items) {
    jobs.push([item.id, item.fr, data.voice]);
    jobs.push([`${item.id}-ex`, item.ex.fr, data.voice]);
  }
  if (unit.grammar) {
    unit.grammar.sections.flatMap((s) => s.examples || []).forEach(([fr], i) => jobs.push([`${unit.id}-x${i + 1}`, fr, data.voice]));
    unit.grammar.drills.forEach((d, i) => jobs.push([`${unit.id}-d${i + 1}`, core.drillSpeech(d), data.voice]));
  }
  if (unit.dialogue) {
    const { speakers, lines } = unit.dialogue;
    lines.forEach(([who, fr], i) => jobs.push([`${unit.id}-l${i + 1}`, fr, speakers[who][1]]));
  }
}

const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
// Forget clips that no longer exist in the course (their files are listed, not deleted).
const wanted = new Set(jobs.map(([id]) => id));
const orphans = Object.keys(manifest).filter((id) => !wanted.has(id));
for (const id of orphans) delete manifest[id];
if (orphans.length) console.log(`Unused clips (safe to delete): ${orphans.map((id) => id + '.m4a').join(', ')}`);

const keyOf = (job) => {
  const [, text, role] = job;
  return useSay(job) ? `say:${SAY_VOICES[role]}|${text}` : `${voiceKey(role)}|${TEMP}|${text}`;
};
const todo = jobs.filter((job) => {
  const [id] = job;
  const out = join(outDir, `${id}.m4a`);
  if (!force && existsSync(out) && ((legacy && manifest[id] === undefined) || manifest[id] === keyOf(job))) { manifest[id] = keyOf(job); return false; }
  return true;
});

const flagged = [];
const sayTodo = todo.filter(useSay);
try {
  for (const job of sayTodo) {
    const [id, text, role] = job;
    const wav = join(tmpDir, `${id}.wav`), out = join(outDir, `${id}.m4a`), key = keyOf(job); // before the entry is cleared
    delete manifest[id]; // a half-written clip must not be trusted if this step fails
    execFileSync('say', ['-v', SAY_VOICES[role], '--file-format=WAVE', '--data-format=LEI16@24000', '-o', wav, text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wav, out]);
    manifest[id] = key;
    rmSync(wav);
  }
} finally {
  if (sayTodo.length) saveManifest();
}
if (sayTodo.length) console.log(`Spoke ${sayTodo.length} clips with macOS say.`);
const kyutaiTodo = todo.filter((job) => !useSay(job));
if (kyutaiTodo.length) {
  // One Kyutai run renders every clip (the model loads once). Its folder is kept between runs, keyed
  // by voice and text, so an interrupted run resumes; it is removed once all clips are converted.
  const work = join(tmpDir, 'kyutai');
  mkdirSync(work, { recursive: true });
  for (const job of kyutaiTodo) { // a leftover take for different text or voice must not be reused
    const [id] = job, rep = join(work, `${id}.json`);
    if (existsSync(rep) && JSON.parse(readFileSync(rep, 'utf8')).key !== keyOf(job)) { rmSync(rep); rmSync(join(work, `${id}.wav`), { force: true }); }
  }
  const jobsPath = join(tmpDir, 'kyutai-jobs.json');
  writeFileSync(jobsPath, JSON.stringify(kyutaiTodo.map((job) => ({ id: job[0], text: job[1], voice: VOICES[job[2]], key: keyOf(job) }))));
  console.log(`Rendering ${kyutaiTodo.length} clips with Kyutai TTS...`);
  execFileSync('uv', ['run', join(root, 'scripts/kyutai-tts.py'), jobsPath, work, '--temp', String(TEMP)], { stdio: 'inherit' });
  try {
    for (const job of kyutaiTodo) {
      const [id] = job;
      const out = join(outDir, `${id}.m4a`);
      delete manifest[id]; // a half-written clip must not be trusted if this step fails
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', join(work, `${id}.wav`), out]);
      manifest[id] = keyOf(job);
      const rep = JSON.parse(readFileSync(join(work, `${id}.json`), 'utf8'));
      if (rep.score !== null && rep.score < 0.95) flagged.push(`  ${id}  "${rep.text}"  -> heard "${rep.heard}" (${rep.score.toFixed(2)})`);
    }
  } finally {
    saveManifest();
  }
  rmSync(work, { recursive: true, force: true });
}
saveManifest();
rmSync(tmpDir, { recursive: true, force: true });
console.log(`Audio: ${todo.length} generated, ${jobs.length - todo.length} up to date, ${jobs.length} total.`);
if (flagged.length) console.log(`Whisper still heard a difference in ${flagged.length} clips (listen to these):\n${flagged.join('\n')}`);
