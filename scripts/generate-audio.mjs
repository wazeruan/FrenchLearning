// Generates French audio for the course with the macOS `say` command, converted to AAC (.m4a):
//   <item>.m4a / <item>-ex.m4a    word and example sentence (default voice)
//   <unit>-x<n>.m4a               grammar examples
//   <unit>-d<n>.m4a               drill sentences with the answer filled in
//   <unit>-l<n>.m4a               dialogue lines, in each speaker's voice
// assets/audio/manifest.json records the text and voice of every clip, so a clip is rebuilt
// whenever its text changes. Usage: node scripts/generate-audio.mjs [--force]
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

const jobs = [];
for (const unit of data.units) {
  for (const item of unit.items) {
    jobs.push([item.id, item.fr, data.voice, 150]);
    jobs.push([`${item.id}-ex`, item.ex.fr, data.voice, 160]);
  }
  if (unit.grammar) {
    unit.grammar.sections.flatMap((s) => s.examples || []).forEach(([fr], i) => jobs.push([`${unit.id}-x${i + 1}`, fr, data.voice, 160]));
    unit.grammar.drills.forEach((d, i) => jobs.push([`${unit.id}-d${i + 1}`, core.drillSpeech(d), data.voice, 160]));
  }
  if (unit.dialogue) {
    const { speakers, lines } = unit.dialogue;
    lines.forEach(([who, fr], i) => jobs.push([`${unit.id}-l${i + 1}`, fr, speakers[who][1], 165]));
  }
}

let made = 0;
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
// Forget clips that no longer exist in the course (their files are listed, not deleted).
const wanted = new Set(jobs.map(([id]) => id));
const orphans = Object.keys(manifest).filter((id) => !wanted.has(id));
for (const id of orphans) delete manifest[id];
if (orphans.length) console.log(`Unused clips (safe to delete): ${orphans.map((id) => id + '.m4a').join(', ')}`);
try {
for (const [id, text, voice, rate] of jobs) {
  const out = join(outDir, `${id}.m4a`);
  const key = `${voice}|${rate}|${text}`;
  if (!force && existsSync(out) && ((legacy && manifest[id] === undefined) || manifest[id] === key)) { manifest[id] = key; continue; }
  const aiff = join(tmpDir, `${id}.aiff`);
  delete manifest[id]; // a half-written clip must not be trusted if this step fails
  execFileSync('say', ['-v', voice, '-r', String(rate), '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, out]);
  rmSync(aiff);
  manifest[id] = key;
  made++;
  if (made % 25 === 0) saveManifest(); // keep progress if a later clip fails
}
} finally {
  saveManifest();
}
rmSync(tmpDir, { recursive: true, force: true });
console.log(`Audio: ${made} generated, ${jobs.length - made} up to date, ${jobs.length} total.`);
