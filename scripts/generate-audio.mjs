// Generates French pronunciation audio for every word and example sentence
// using the macOS `say` command (voice from data.js) and `afconvert` to AAC (.m4a).
// Usage: node scripts/generate-audio.mjs [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = createRequire(import.meta.url)(join(root, 'js/data.js'));
const outDir = join(root, 'assets/audio');
const tmpDir = join(root, '.tmp');
const force = process.argv.includes('--force');
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

function synth(text, name, rate) {
  const out = join(outDir, `${name}.m4a`);
  if (!force && existsSync(out)) return false;
  const aiff = join(tmpDir, `${name}.aiff`);
  execFileSync('say', ['-v', data.voice, '-r', String(rate), '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, out]);
  rmSync(aiff);
  return true;
}

let made = 0, total = 0;
for (const unit of data.units) {
  for (const item of unit.items) {
    total += 2;
    if (synth(item.fr, item.id, 150)) made++;
    if (synth(item.ex.fr, `${item.id}-ex`, 160)) made++;
  }
}
rmSync(tmpDir, { recursive: true, force: true });
console.log(`Audio: ${made} generated, ${total - made} already present, ${total} total.`);
