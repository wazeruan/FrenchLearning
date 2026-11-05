// Writes the demo progress used for the README screenshots: one JSON file of localStorage entries per
// screenshot, into the folder given as the first argument. Nothing here touches real progress.
// Usage: node scripts/screenshot-states.mjs <out-dir>   (scripts/take-screenshots.sh runs it)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const DATA = require('../js/data.js');
const out = process.argv[2];
if (!out) { console.error('usage: node scripts/screenshot-states.mjs <out-dir>'); process.exit(1); }
mkdirSync(out, { recursive: true });

// Three weeks of study: about one unit a day (a few days off), mostly right answers, with reviews.
const rng = Core.mulberry32(2026);
const state = Core.defaultState();
Object.assign(state.settings, { theme: 'light', autoplay: false, sfx: false });
const today = new Date();
const dayAt = (back, hour) => { const d = new Date(today); d.setDate(d.getDate() - back); d.setHours(hour, 15, 0, 0); return d; };
let unit = 0;
for (let back = 20; back >= 0; back--) {
  if (back === 15 || back === 9) continue; // days off
  const due = Core.dueWords(state, Core.dayKey(dayAt(back, 7)));
  if (due.length) Core.completeReview(state, DATA, due.map((id) => ({ item: id, type: 'listen', correct: rng() > 0.15 })), dayAt(back, 7), 5);
  const u = DATA.units[unit++];
  const results = u.items.map((it) => ({ item: it.id, type: 'mc-fr-en', correct: rng() > 0.12 }));
  Core.completeLesson(state, DATA, u.id, results, dayAt(back, back ? 19 : 8), 14);
}
state.createdAt = Core.dayKey(dayAt(21, 12));

// A practice left unfinished, resumed at the given exercise (how a screenshot shows one exercise type).
function resumeAt(unitId, pick) {
  const queue = Core.buildLesson(DATA, unitId, Core.mulberry32(7));
  const k = queue.findIndex(pick);
  if (k < 0) throw new Error(`no such exercise in ${unitId}`);
  return {
    v: 1, kind: 'lesson', unit: unitId, queue: queue.slice(k), total: queue.length, done: k,
    results: queue.slice(0, k).map((ex) => ({ item: ex.item || 'x', type: ex.type, correct: true })),
    elapsed: 4 * 60000, savedAt: Date.now(),
  };
}
const files = {
  home: resumeAt('d01', (e) => e.type === 'chunks'),
  'sounds-drill': resumeAt('p01', (e) => e.type === 'fill'),
  chunks: resumeAt('d01', (e) => e.type === 'chunks'),
  gender: resumeAt('u06', (e) => e.type === 'gender'),
  dialogue: null,
  progress: null,
};
for (const [name, cp] of Object.entries(files)) {
  const entries = { [Core.STORAGE_KEY]: JSON.stringify(state) };
  if (cp) entries[Core.CHECKPOINT_KEY] = JSON.stringify(cp);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(entries));
}
console.log(`Demo states: ${Object.keys(files).length} files, ${state.xp} XP, ${Core.completedUnits(state, DATA)} units done.`);
