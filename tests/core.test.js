'use strict';
// Unit tests for js/core.js. Run from the project root: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'js/core.js'));
const DATA = require(path.join(ROOT, 'js/data.js'));

// Local-time Date helper (month is 1-based here).
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const fresh = () => Core.defaultState();
const unitIndex = (id) => DATA.units.findIndex((u) => u.id === id);
const allCorrect = (unit) => unit.items.map((it) => ({ item: it.id, type: 'mc-fr-en', correct: true }));

// ---------------------------------------------------------------- dates
test('dayKey formats local date with zero padding', () => {
  assert.equal(Core.dayKey(at(2026, 1, 5)), '2026-01-05');
  assert.equal(Core.dayKey(at(2026, 12, 31, 23, 59)), '2026-12-31');
  assert.equal(Core.dayKey(at(2026, 3, 1, 0, 0)), '2026-03-01');
});

test('addDays crosses month, year and leap-day boundaries', () => {
  assert.equal(Core.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(Core.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(Core.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(Core.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Core.addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(Core.addDays('2026-03-15', 0), '2026-03-15');
  assert.equal(Core.addDays('2026-01-01', 365), '2027-01-01');
});

test('addDays / diffDays are stable across DST changes (local + forced TZs)', () => {
  const saved = process.env.TZ;
  try {
    for (const tz of [saved, 'America/Edmonton', 'Europe/Paris', 'Australia/Sydney']) {
      if (tz) process.env.TZ = tz;
      // North-American spring-forward 2026-03-08, fall-back 2026-11-01; EU 2026-03-29 / 2026-10-25.
      const weeks = [['2026-03-05', '2026-03-12'], ['2026-10-29', '2026-11-05'], ['2026-03-26', '2026-04-02'], ['2026-10-22', '2026-10-29'], ['2026-04-02', '2026-04-09']];
      for (const [start, end] of weeks) {
        const seen = [];
        for (let i = 0; i <= 7; i++) seen.push(Core.addDays(start, i));
        assert.equal(new Set(seen).size, 8, `${tz} ${start}: no duplicate/skipped day`);
        assert.equal(seen[7], end, `${tz} ${start}`);
        assert.equal(Core.diffDays(start, end), 7, `${tz} diffDays ${start}`);
        for (let i = 0; i < 7; i++) assert.equal(Core.diffDays(seen[i], seen[i + 1]), 1);
      }
      // dayKey near midnight on DST days
      assert.equal(Core.dayKey(new Date(2026, 2, 8, 0, 30)), '2026-03-08');
      assert.equal(Core.dayKey(new Date(2026, 10, 1, 23, 30)), '2026-11-01');
    }
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('diffDays returns b - a', () => {
  assert.equal(Core.diffDays('2026-10-13', '2026-10-14'), 1);
  assert.equal(Core.diffDays('2026-10-14', '2026-10-13'), -1);
  assert.equal(Core.diffDays('2026-10-13', '2026-10-13'), 0);
  assert.equal(Core.diffDays('2026-12-30', '2027-01-02'), 3);
  assert.equal(Core.diffDays('2026-01-01', '2027-01-01'), 365);
});

// ---------------------------------------------------------------- streaks
test('streak: first activity, same-day repeat, consecutive days, best', () => {
  const s = fresh();
  assert.equal(Core.currentStreak(s, '2026-10-01'), 0);
  Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 1));
  assert.deepEqual(s.streak, { current: 1, best: 1, lastDay: '2026-10-01' });
  Core.recordActivity(s, { xp: 5, kind: 'review' }, at(2026, 10, 1, 20));
  assert.equal(s.streak.current, 1, 'same day does not increment');
  Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 2));
  Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 3, 0, 1));
  assert.equal(s.streak.current, 3);
  assert.equal(s.streak.best, 3);
  assert.equal(s.xp, 20);
  const d1 = s.daily['2026-10-01'];
  assert.deepEqual({ xp: d1.xp, lessons: d1.lessons, reviews: d1.reviews, minutes: d1.minutes }, { xp: 10, lessons: 1, reviews: 1, minutes: 0 });
  assert.equal(d1.listening, 0);
});

test('streak: across month/year boundary increments', () => {
  const s = fresh();
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 12, 31, 23, 59));
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2027, 1, 1, 0, 1));
  assert.equal(s.streak.current, 2);
});

test('streak: gap of 2+ days resets to 1, best is kept', () => {
  const s = fresh();
  for (let d = 1; d <= 4; d++) Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, d));
  assert.equal(s.streak.current, 4);
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 6)); // skipped the 5th
  assert.equal(s.streak.current, 1);
  assert.equal(s.streak.best, 4);
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 7));
  assert.equal(s.streak.current, 2);
  assert.equal(s.streak.best, 4);
});

test('currentStreak: kept if last activity today or yesterday, 0 if earlier', () => {
  const s = fresh();
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 10));
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 11));
  assert.equal(Core.currentStreak(s, '2026-10-11'), 2);
  assert.equal(Core.currentStreak(s, '2026-10-12'), 2);
  assert.equal(Core.currentStreak(s, '2026-10-13'), 0);
  assert.equal(Core.currentStreak(s, '2026-12-01'), 0);
  assert.equal(s.streak.current, 2, 'currentStreak does not mutate');
  // lastDay in the future (clock moved back) shows 0
  assert.equal(Core.currentStreak(s, '2026-10-10'), 0);
  assert.equal(Core.currentStreak(s, '2026-09-01'), 0);
});

// ---------------------------------------------------------------- daily goal
test('goalReachedNow fires once per day when crossing the goal', () => {
  const s = fresh();
  s.settings.dailyGoal = 20;
  assert.equal(Core.recordActivity(s, { xp: 15, kind: 'lesson' }, at(2026, 10, 1, 9)).goalReachedNow, false);
  assert.equal(Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 1, 10)).goalReachedNow, true, 'exactly reaching goal counts');
  assert.equal(Core.recordActivity(s, { xp: 30, kind: 'lesson' }, at(2026, 10, 1, 11)).goalReachedNow, false);
  assert.equal(s.stats.goalsHit, 1);
  assert.equal(Core.todayXp(s, '2026-10-01'), 50);
  // next day: a single big jump crosses again
  assert.equal(Core.recordActivity(s, { xp: 40, kind: 'review' }, at(2026, 10, 2, 9)).goalReachedNow, true);
  assert.equal(s.stats.goalsHit, 2);
  assert.equal(Core.todayXp(s, '2026-10-03'), 0);
});

test('earlyBird (<8h) and nightOwl (>=22h)', () => {
  const s = fresh();
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 7, 59));
  assert.equal(s.stats.earlyBird, 1);
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 8, 0));
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 21, 59));
  assert.equal(s.stats.earlyBird, 1);
  assert.equal(s.stats.nightOwl, 0);
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 22, 0));
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 0, 0));
  assert.equal(s.stats.nightOwl, 1);
  assert.equal(s.stats.earlyBird, 2);
});

// ---------------------------------------------------------------- spaced repetition
test('reviewAnswer: box progression, cap at 5, due dates follow INTERVALS', () => {
  const s = fresh();
  const today = '2026-10-01';
  const expectedBoxes = [2, 3, 4, 5, 5, 5];
  expectedBoxes.forEach((box, i) => {
    const w = Core.reviewAnswer(s, 'u01-01', true, today);
    assert.equal(w.box, box);
    assert.equal(w.due, Core.addDays(today, Core.INTERVALS[box]));
    assert.equal(w.seen, i + 1);
    assert.equal(w.correct, i + 1);
  });
  assert.equal(Core.INTERVALS[5], 16);
  assert.equal(s.words['u01-01'].due, '2026-10-17');
});

test('reviewAnswer: wrong resets to box 1 with 1-day interval', () => {
  const s = fresh();
  for (let i = 0; i < 3; i++) Core.reviewAnswer(s, 'x', true, '2026-10-01');
  assert.equal(s.words.x.box, 4);
  const w = Core.reviewAnswer(s, 'x', false, '2026-10-05');
  assert.equal(w.box, 1);
  assert.equal(w.due, '2026-10-06');
  assert.equal(w.wrong, 1);
  assert.equal(w.seen, 4);
  // new word answered wrong starts in box 1
  const n = Core.reviewAnswer(s, 'new', false, '2026-10-05');
  assert.deepEqual(n, { box: 1, due: '2026-10-06', seen: 1, correct: 0, wrong: 1 });
});

test('dueWords: filters by due <= today, orders by due then box', () => {
  const s = fresh();
  s.words = {
    a: { box: 3, due: '2026-10-05', seen: 1, correct: 1, wrong: 0 },
    b: { box: 1, due: '2026-10-03', seen: 1, correct: 0, wrong: 1 },
    c: { box: 2, due: '2026-10-05', seen: 1, correct: 1, wrong: 0 },
    d: { box: 1, due: '2026-10-06', seen: 1, correct: 0, wrong: 0 },
    e: { box: 4, due: '2026-09-30', seen: 1, correct: 1, wrong: 0 },
  };
  assert.deepEqual(Core.dueWords(s, '2026-10-05'), ['e', 'b', 'c', 'a']);
  assert.deepEqual(Core.dueWords(s, '2026-09-29'), []);
  assert.deepEqual(Core.dueWords(s, '2026-12-01'), ['e', 'b', 'c', 'a', 'd']);
});

test('weakestWords: lowest box first, then most mistakes; respects n', () => {
  const s = fresh();
  s.words = {
    a: { box: 3, due: 'x', seen: 0, correct: 0, wrong: 9 },
    b: { box: 1, due: 'x', seen: 0, correct: 0, wrong: 1 },
    c: { box: 1, due: 'x', seen: 0, correct: 0, wrong: 5 },
    d: { box: 2, due: 'x', seen: 0, correct: 0, wrong: 0 },
  };
  assert.deepEqual(Core.weakestWords(s), ['c', 'b', 'd', 'a']);
  assert.deepEqual(Core.weakestWords(s, 2), ['c', 'b']);
  assert.deepEqual(Core.weakestWords(fresh()), []);
});

test('masteredCount counts box >= 4', () => {
  const s = fresh();
  s.words = { a: { box: 3 }, b: { box: 4 }, c: { box: 5 }, d: { box: 1 } };
  assert.equal(Core.masteredCount(s), 2);
});

// ---------------------------------------------------------------- checkAnswer
test('checkAnswer: exact and normalisation', () => {
  assert.equal(Core.checkAnswer('bonjour', 'bonjour'), 'exact');
  assert.equal(Core.checkAnswer('  BONJOUR  ', 'bonjour'), 'exact');
  assert.equal(Core.checkAnswer('Comment ça va', 'comment ça va ?'), 'exact');
  assert.equal(Core.checkAnswer('comment   ça\tva?!', 'comment ça va ?'), 'exact');
  assert.equal(Core.checkAnswer('s’il vous plaît', "s'il vous plaît"), 'exact');
  assert.equal(Core.checkAnswer("je m'appelle", 'je m’appelle'), 'exact');
  assert.equal(Core.checkAnswer('la soeur', 'la sœur'), 'exact');
  assert.equal(Core.checkAnswer("l'oeuf", "l'œuf"), 'exact');
});

test('checkAnswer: accent', () => {
  assert.equal(Core.checkAnswer('a bientot', 'à bientôt'), 'accent');
  assert.equal(Core.checkAnswer('le frere', 'le frère'), 'accent');
  assert.equal(Core.checkAnswer('enchante', 'enchanté'), 'accent');
});

test('checkAnswer: article', () => {
  assert.equal(Core.checkAnswer('chat', 'le chat'), 'article');
  assert.equal(Core.checkAnswer('eau', "l'eau"), 'article');
  assert.equal(Core.checkAnswer('la chat', 'le chat'), 'article');
  assert.equal(Core.checkAnswer('frere', 'le frère'), 'article', 'article + accent');
});

test('checkAnswer: wrong and empty', () => {
  assert.equal(Core.checkAnswer('chien', 'le chat'), 'wrong');
  assert.equal(Core.checkAnswer('', 'bonjour'), 'wrong');
  assert.equal(Core.checkAnswer('   ', 'bonjour'), 'wrong');
  assert.equal(Core.checkAnswer('?!', 'bonjour'), 'wrong');
  assert.equal(Core.checkAnswer('le', 'le chat'), 'wrong');
  // false positives of the old article regex
  assert.equal(Core.checkAnswer('lapin', 'la pin'), 'wrong');
  assert.equal(Core.checkAnswer('e table', 'une table'), 'wrong');
  assert.equal(Core.checkAnswer('it', 'le lait'), 'wrong');
  assert.equal(Core.checkAnswer('s chats', 'les chats'), 'wrong');
});

// Probes the article regex against nouns whose first letters look like an article.
test('checkAnswer: article detection for nouns starting with le/la/un (lait, lapin, lit)', () => {
  assert.equal(Core.checkAnswer('lait', 'le lait'), 'article');
  assert.equal(Core.checkAnswer('lapin', 'le lapin'), 'article');
  assert.equal(Core.checkAnswer('lit', 'le lit'), 'article');
  assert.equal(Core.checkAnswer('chats', 'les chats'), 'article');
  assert.equal(Core.checkAnswer('table pour deux', 'une table pour deux'), 'article');
  assert.equal(Core.checkAnswer('le lait', 'lait'), 'article', 'extra article in input');
  assert.equal(Core.checkAnswer('oeuf', "l'œuf"), 'article');
  assert.equal(Core.checkAnswer('l’ oiseau', "l'oiseau"), 'article', 'stray space after apostrophe is not normalised; lands in article');
  assert.equal(Core.checkAnswer('un', 'un'), 'exact', 'number "un" is not stripped to empty');
});

test('checkAnswer: typing every course word exactly is "exact", and dropping its article is "article"', () => {
  for (const it of Core.allItems(DATA)) {
    assert.equal(Core.checkAnswer(it.fr, it.fr), 'exact', it.id);
    const m = /^(le|la|les|un|une|des) (.+)$|^l'(.+)$/.exec(it.fr);
    if (m && ['le', 'la', 'les', "l'"].some((a) => it.fr.startsWith(a))) {
      const bare = m[2] || m[3];
      assert.equal(Core.checkAnswer(bare, it.fr), 'article', `${it.id}: "${bare}" vs "${it.fr}"`);
    }
  }
});

// ---------------------------------------------------------------- tokenize
test('tokenize attaches standalone punctuation to the previous word', () => {
  assert.deepEqual(Core.tokenize('Bonjour, madame !'), ['Bonjour,', 'madame !']);
  assert.deepEqual(Core.tokenize('Où est la clé ?'), ['Où', 'est', 'la', 'clé ?']);
  assert.deepEqual(Core.tokenize('  Oui,  bien sûr. '), ['Oui,', 'bien', 'sûr.']);
  assert.deepEqual(Core.tokenize('« Salut » !'), ['«', 'Salut » !']);
});

test('tokenize: tokens re-joined equal every example sentence', () => {
  for (const it of Core.allItems(DATA)) {
    const toks = Core.tokenize(it.ex.fr);
    assert.ok(toks.length >= 2, `${it.id} has >=2 tiles`);
    assert.equal(toks.join(' '), it.ex.fr.trim().replace(/\s+/g, ' '), it.id);
    assert.equal(toks.join(' '), it.ex.fr, `${it.id} example has no irregular whitespace`);
  }
});

// ---------------------------------------------------------------- buildLesson
const SINGLE = new Set(['mc-en-fr', 'mc-fr-en', 'listen', 'type']);

test('buildLesson: structure for all 25 units and several seeds', () => {
  assert.equal(DATA.units.length, 25);
  const byId = new Map(Core.allItems(DATA).map((it) => [it.id, it]));
  for (const unit of DATA.units) {
    const ids = unit.items.map((it) => it.id);
    for (const seed of [1, 2, 3, 42, 1234, 99999, 0xdeadbeef]) {
      const ex = Core.buildLesson(DATA, unit.id, Core.mulberry32(seed));
      const tag = `${unit.id} seed ${seed}`;
      const singles = ex.filter((e) => SINGLE.has(e.type));
      assert.deepEqual(singles.map((e) => e.item).sort(), ids.slice().sort(), `${tag}: each item once`);
      const genders = ex.filter((e) => e.type === 'gender').length;
      const fills = new Set(ex.filter((e) => e.type === 'fill').map((e) => e.drill));
      const spotable = unit.grammar ? unit.grammar.drills.filter((d, i) => !fills.has(i) && Core.spotDrill(d)).length : 0;
      const spots = Math.min(2, spotable);
      const chunks = ex.filter((e) => e.type === 'chunks');
      assert.ok(chunks.length <= 1, tag);
      assert.equal(ex.length, ids.length + 3 + genders + chunks.length + (unit.grammar ? 6 : 0) + spots, tag);
      assert.equal(ex.filter((e) => e.type === 'fill').length, unit.grammar ? 6 : 0, tag);
      assert.equal(ex.filter((e) => e.type === 'spot').length, spots, tag);
      const dict = ex.filter((e) => e.type === 'dictation');
      assert.equal(dict.length, 1, tag);
      assert.ok(ids.includes(dict[0].item), tag);
      assert.notEqual(dict[0].item, ex[ex.length - 1].item, `${tag}: dictation and sentence builder use different sentences`);

      const matches = ex.filter((e) => e.type === 'match');
      assert.equal(matches.length, 1, tag);
      assert.equal(matches[0].pairs.length, 4, tag);
      assert.equal(new Set(matches[0].pairs).size, 4, tag);
      for (const p of matches[0].pairs) assert.ok(ids.includes(p), tag);

      const orders = ex.filter((e) => e.type === 'order');
      assert.equal(orders.length, 1, tag);
      assert.equal(ex[ex.length - 1].type, 'order', `${tag}: order last`);
      const o = orders[0];
      assert.ok(ids.includes(o.item), tag);
      const expected = Core.tokenize(byId.get(o.item).ex.fr);
      assert.deepEqual(o.tiles.slice().sort(), expected.slice().sort(), `${tag}: tiles permutation`);

      for (const e of singles) {
        if (e.type === 'type') { assert.equal(e.options, undefined); continue; }
        const field = e.type === 'mc-fr-en' ? 'en' : 'fr';
        assert.equal(e.options.length, 4, `${tag} ${e.item}`);
        assert.ok(e.options.some((op) => op.id === e.item), `${tag}: answer present`);
        assert.equal(new Set(e.options.map((op) => op.id)).size, 4, `${tag}: unique ids`);
        assert.equal(new Set(e.options.map((op) => op.text)).size, 4, `${tag}: unique texts`);
        for (const op of e.options) assert.equal(op.text, byId.get(op.id)[field], `${tag}: option text matches field`);
        // distractors should prefer the same unit (all units have >= 4 items)
        assert.ok(e.options.every((op) => byId.get(op.id).unit === unit.id), `${tag}: same-unit distractors`);
      }
    }
  }
});

test('buildLesson is deterministic for a given seed', () => {
  const a = Core.buildLesson(DATA, 'u05', Core.mulberry32(7));
  const b = Core.buildLesson(DATA, 'u05', Core.mulberry32(7));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- buildReview
test('buildReview: one exercise per valid id, ignores unknown ids', () => {
  const ids = ['u01-01', 'nope', 'u07-03', 'u12-08', 'zzz'];
  for (const seed of [1, 2, 3, 4, 5]) {
    const ex = Core.buildReview(DATA, ids, Core.mulberry32(seed));
    assert.equal(ex.length, 3);
    assert.deepEqual(ex.map((e) => e.item).sort(), ['u01-01', 'u07-03', 'u12-08']);
    for (const e of ex) {
      assert.ok(SINGLE.has(e.type));
      if (e.type !== 'type') {
        assert.equal(e.options.length, 4);
        assert.ok(e.options.some((op) => op.id === e.item));
      }
    }
  }
  assert.deepEqual(Core.buildReview(DATA, [], Core.mulberry32(1)), []);
});

// ---------------------------------------------------------------- completeLesson
test('completeLesson: XP formula, stars, completion, words added', () => {
  const unit = DATA.units[0];
  const s = fresh();
  const res = allCorrect(unit).concat([{ item: null, type: 'match', correct: true }, { item: 'u01-01', type: 'order', correct: true }]);
  const r = Core.completeLesson(s, DATA, unit.id, res, at(2026, 10, 1));
  assert.equal(r.correct, 12);
  assert.equal(r.xp, 10 + 12 + 5);
  assert.equal(r.perfect, true);
  assert.equal(r.stars, 3);
  assert.equal(r.firstCompletion, true);
  assert.equal(s.xp, 27);
  assert.deepEqual(s.units.u01, { completed: true, bestScore: 1, stars: 3, plays: 1 });
  for (const it of unit.items) {
    assert.ok(s.words[it.id], it.id);
    assert.equal(s.words[it.id].box, 1);
    assert.equal(s.words[it.id].due, '2026-10-02');
  }
  assert.equal(Object.keys(s.words).length, unit.items.length);
  assert.equal(s.stats.lessons, 1);
  assert.equal(s.stats.perfect, 1);
  assert.equal(s.stats.totalAnswered, 12);
});

test('completeLesson: imperfect XP and stars thresholds', () => {
  const mk = (n, ok) => Array.from({ length: n }, (_, i) => ({ item: 'u01-01', type: 'listen', correct: i < ok }));
  let s = fresh();
  let r = Core.completeLesson(s, DATA, 'u01', mk(10, 8), at(2026, 10, 1));
  assert.equal(r.xp, 18);
  assert.equal(r.stars, 2);
  assert.equal(r.perfect, false);
  assert.equal(s.stats.listenCorrect, 8);
  s = fresh();
  r = Core.completeLesson(s, DATA, 'u01', mk(10, 7), at(2026, 10, 1));
  assert.equal(r.xp, 17);
  assert.equal(r.stars, 1);
  assert.equal(Core.starsFor(1), 3);
  assert.equal(Core.starsFor(0.8), 2);
  assert.equal(Core.starsFor(0.79), 1);
  assert.equal(Core.starsFor(0), 1);
  s = fresh();
  r = Core.completeLesson(s, DATA, 'u01', [], at(2026, 10, 1));
  assert.equal(r.xp, 10);
  assert.equal(r.perfect, false);
});

test('completeLesson: best score / stars never decrease on worse replay', () => {
  const s = fresh();
  const unit = DATA.units[0];
  Core.completeLesson(s, DATA, unit.id, allCorrect(unit), at(2026, 10, 1));
  const bad = unit.items.map((it, i) => ({ item: it.id, type: 'type', correct: i < 2 }));
  const r = Core.completeLesson(s, DATA, unit.id, bad, at(2026, 10, 1, 13));
  assert.equal(r.stars, 1);
  assert.equal(r.firstCompletion, false);
  assert.deepEqual(s.units.u01, { completed: true, bestScore: 1, stars: 3, plays: 2 });
});

test('completeLesson: replay does not reset existing word progress', () => {
  const s = fresh();
  const unit = DATA.units[0];
  Core.completeLesson(s, DATA, unit.id, allCorrect(unit), at(2026, 10, 1));
  Core.reviewAnswer(s, 'u01-01', true, '2026-10-02');
  Core.completeLesson(s, DATA, unit.id, allCorrect(unit), at(2026, 10, 3));
  assert.equal(s.words['u01-01'].box, 2);
});

test('unitUnlocked: sequential unlock and unlockAll', () => {
  const s = fresh();
  assert.equal(Core.unitUnlocked(s, DATA, 0), true);
  assert.equal(Core.unitUnlocked(s, DATA, 1), false);
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  assert.equal(Core.unitUnlocked(s, DATA, 1), true);
  assert.equal(Core.unitUnlocked(s, DATA, 2), false);
  s.settings.unlockAll = true;
  assert.equal(Core.unitUnlocked(s, DATA, 11), true);
});

// ---------------------------------------------------------------- completeReview
test('completeReview: XP = 5 + correct, applies reviewAnswer, stats.reviews', () => {
  const s = fresh();
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  const xpBefore = s.xp;
  const res = [
    { item: 'u01-01', type: 'type', correct: true },
    { item: 'u01-02', type: 'listen', correct: true },
    { item: 'u01-03', type: 'mc-en-fr', correct: false },
  ];
  const r = Core.completeReview(s, DATA, res, at(2026, 10, 2));
  assert.equal(r.xp, 7);
  assert.equal(r.correct, 2);
  assert.equal(r.total, 3);
  assert.equal(s.xp, xpBefore + 7);
  assert.equal(s.stats.reviews, 1);
  assert.equal(s.words['u01-01'].box, 2);
  assert.equal(s.words['u01-01'].due, '2026-10-04');
  assert.equal(s.words['u01-03'].box, 1);
  assert.equal(s.words['u01-03'].due, '2026-10-03');
  assert.equal(s.stats.typedCorrect, 1);
  assert.equal(s.stats.listenCorrect, 1);
  assert.equal(s.daily['2026-10-02'].reviews, 1);
  assert.equal(s.streak.current, 2);
  assert.ok(r.achievements.some((a) => a.id === 'review-1'));
});

// ---------------------------------------------------------------- achievements & milestones
test('evaluateProgress: achievements unlock at the right time, once only', () => {
  const s = fresh();
  const ids = (r) => r.achievements.map((a) => a.id);
  assert.deepEqual(Core.evaluateProgress(s, DATA, at(2026, 10, 1)), { achievements: [], milestones: [] });

  // Day 1: unit 1 imperfect at noon
  const u1 = DATA.units[0];
  let r = Core.completeLesson(s, DATA, 'u01', u1.items.map((it, i) => ({ item: it.id, type: 'type', correct: i > 0 })), at(2026, 10, 1));
  assert.ok(ids(r).includes('first-lesson'));
  assert.ok(!ids(r).includes('perfect'));
  assert.ok(!ids(r).includes('streak-3'));
  assert.ok(!ids(r).includes('words-25'));
  assert.equal(s.achievements['first-lesson'], '2026-10-01');

  // Day 2: unit 2 perfect -> 'perfect', words = 18
  r = Core.completeLesson(s, DATA, DATA.units[1].id, allCorrect(DATA.units[1]), at(2026, 10, 2));
  assert.ok(ids(r).includes('perfect'));
  assert.ok(!ids(r).includes('first-lesson'), 'not returned again');
  assert.ok(!ids(r).includes('words-25'));
  assert.equal(r.milestones.length, 0);

  // Day 3: unit 3 -> streak-3, words-25 (26 words), no milestone yet (a1-m1 is after 7 units)
  r = Core.completeLesson(s, DATA, DATA.units[2].id, allCorrect(DATA.units[2]), at(2026, 10, 3));
  assert.ok(ids(r).includes('streak-3'));
  assert.ok(ids(r).includes('words-25'));
  assert.ok(!ids(r).includes('perfect'));
  assert.deepEqual(r.milestones, []);
  // Units 4..6: still no milestone; unit 7 -> a1-m1
  for (let i = 3; i < 6; i++) {
    r = Core.completeLesson(s, DATA, DATA.units[i].id, allCorrect(DATA.units[i]), at(2026, 10, 3, 13));
    assert.deepEqual(r.milestones, [], `after ${i + 1} units`);
  }
  r = Core.completeLesson(s, DATA, DATA.units[6].id, allCorrect(DATA.units[6]), at(2026, 10, 3, 14));
  assert.deepEqual(r.milestones.map((m) => m.id), ['a1-m1']);
  assert.equal(s.milestones['a1-m1'], '2026-10-03');

  // Replay: nothing re-announced
  r = Core.evaluateProgress(s, DATA, at(2026, 10, 3, 15));
  assert.deepEqual(r, { achievements: [], milestones: [] });
});

test('milestone a1-m1 not reached with 6 units, nor with replays of the same unit', () => {
  const s = fresh();
  for (let k = 0; k < 8; k++) Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  let r;
  for (let i = 1; i < 6; i++) r = Core.completeLesson(s, DATA, DATA.units[i].id, allCorrect(DATA.units[i]), at(2026, 10, 1));
  assert.equal(r.milestones.length, 0);
  assert.equal(s.milestones['a1-m1'], undefined);
  assert.equal(Core.completedUnits(s, DATA), 6);
});

test('early / night achievements', () => {
  const s = fresh();
  const r = Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1, 6));
  assert.ok(r.achievements.some((a) => a.id === 'early'));
  assert.ok(!r.achievements.some((a) => a.id === 'night'));
  const r2 = Core.completeLesson(s, DATA, 'u02', allCorrect(DATA.units[1]), at(2026, 10, 1, 23));
  assert.ok(r2.achievements.some((a) => a.id === 'night'));
});

test('all units complete -> all-units achievement and a1-m4', () => {
  const s = fresh();
  let r;
  DATA.units.forEach((u, i) => { r = Core.completeLesson(s, DATA, u.id, allCorrect(u), at(2026, 10, 1 + i)); });
  assert.ok(r.achievements.some((a) => a.id === 'all-units'));
  assert.ok(r.milestones.some((m) => m.id === 'a1-m4'));
  assert.ok(s.achievements['words-all']);
  assert.deepEqual(Object.keys(s.milestones).sort(), ['a1-m1', 'a1-m2', 'a1-m3', 'a1-m4']);
  // Each milestone is reached on the day its `after`-th unit was completed (unit i on Oct 1+i).
  for (const m of DATA.milestones) assert.equal(s.milestones[m.id], Core.dayKey(at(2026, 10, m.after)), m.id);
});

// ---------------------------------------------------------------- migrate
test('migrate: null / garbage input gives default state', () => {
  const def = fresh();
  for (const raw of [null, undefined, 42, 'oops', true, [], [1, 2], () => 1]) {
    const s = Core.migrate(raw);
    assert.deepEqual(s, def, String(raw));
  }
});

test('migrate: partial old state keeps values and fills missing keys', () => {
  const old = {
    xp: 123,
    settings: { dailyGoal: 50, name: 'Wei' },
    stats: { lessons: 4 },
    streak: { current: 2, best: 5, lastDay: '2026-10-01' },
    words: { 'u01-01': { box: 3, due: '2026-10-05', seen: 3, correct: 3, wrong: 0 } },
    units: null,
  };
  const s = Core.migrate(old);
  assert.equal(s.xp, 123);
  assert.equal(s.settings.dailyGoal, 50);
  assert.equal(s.settings.name, 'Wei');
  assert.equal(s.settings.autoplay, true);
  assert.equal(s.settings.unlockAll, false);
  assert.equal(s.settings.theme, 'auto');
  assert.equal(s.stats.lessons, 4);
  assert.equal(s.stats.goalsHit, 0);
  assert.equal(s.stats.nightOwl, 0);
  assert.deepEqual(s.streak, { current: 2, best: 5, lastDay: '2026-10-01' });
  assert.equal(s.words['u01-01'].box, 3);
  assert.deepEqual(s.units, {});
  assert.deepEqual(s.achievements, {});
  assert.deepEqual(s.milestones, {});
  assert.deepEqual(s.daily, {});
  // and the migrated state is usable
  Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 2));
  assert.equal(s.streak.current, 3);
});

test('migrate: malicious / garbage import is sanitised and never throws', () => {
  const raw = {
    version: 99,
    evil: '<script>alert(1)</script>',
    createdAt: 'yesterday',
    xp: '<img src=x onerror=alert(1)>',
    settings: 'abc',
    stats: { lessons: -3, reviews: NaN, perfect: Infinity, goalsHit: '7', earlyBird: 2, bogus: 9 },
    streak: { current: '5', best: -1, lastDay: 5 },
    daily: { '2026-10-01': { xp: 10, lessons: 'x', reviews: 1 }, 'not-a-day': { xp: 5 }, '2026-10-02': 'str' },
    units: { u01: { completed: 'yes', bestScore: 7, stars: 99, plays: -2 }, u02: { completed: true, bestScore: 0.5, stars: 2, plays: 3 }, u03: 'x', u04: [] },
    words: {
      ok: { box: 9, due: '2026-10-05', seen: 2, correct: 1, wrong: 1 },
      low: { box: -4, due: '2026-10-01' },
      frac: { box: 2.6, due: '2026-10-02', seen: 'many' },
      nobox: { due: '2026-10-03' },
      missingDue: { box: 3 },
      badDue: { box: 3, due: '<b>' },
      numDue: { box: 3, due: 20261001 },
      arr: [1, 2],
      nul: null,
    },
    achievements: { 'first-lesson': '2026-10-01', perfect: true, x: '<img>', y: 5 },
    milestones: { m1: '2026-10-03', m2: {} },
  };
  let s;
  assert.doesNotThrow(() => { s = Core.migrate(JSON.parse(JSON.stringify(raw))); });
  s = Core.migrate(raw); // also with non-JSON values (NaN, Infinity)
  const keys = Object.keys(Core.defaultState()).sort();
  assert.deepEqual(Object.keys(s).sort(), keys, 'unknown top-level keys dropped');
  assert.equal(s.version, 1);
  assert.match(s.createdAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.xp, 0);
  assert.deepEqual(s.settings, Core.defaultState().settings);
  assert.deepEqual(Object.keys(s.stats).sort(), Object.keys(Core.defaultState().stats).sort());
  assert.equal(s.stats.lessons, 0);
  assert.equal(s.stats.reviews, 0);
  assert.equal(s.stats.perfect, 0);
  assert.equal(s.stats.goalsHit, 0);
  assert.equal(s.stats.earlyBird, 2);
  assert.deepEqual(s.streak, { current: 0, best: 0, lastDay: null });
  assert.deepEqual(s.daily, { '2026-10-01': { xp: 10, lessons: 0, reviews: 1, minutes: 0, listening: 0 } });
  assert.deepEqual(s.units.u01, { completed: false, bestScore: 1, stars: 3, plays: 0 });
  assert.deepEqual(s.units.u02, { completed: true, bestScore: 0.5, stars: 2, plays: 3 });
  assert.equal(s.units.u03, undefined);
  assert.equal(s.units.u04, undefined);
  assert.deepEqual(Object.keys(s.words).sort(), ['frac', 'low', 'nobox', 'ok']);
  assert.equal(s.words.ok.box, 5);
  assert.equal(s.words.low.box, 1);
  assert.equal(s.words.frac.box, 3);
  assert.equal(s.words.frac.seen, 0);
  assert.equal(s.words.nobox.box, 1);
  for (const w of Object.values(s.words)) {
    for (const k of ['seen', 'correct', 'wrong']) assert.ok(Number.isFinite(w[k]) && w[k] >= 0);
  }
  assert.deepEqual(s.achievements, { 'first-lesson': '2026-10-01' });
  assert.deepEqual(s.milestones, { m1: '2026-10-03' });

  // downstream functions work on the output
  assert.equal(Core.currentStreak(s, '2026-10-13'), 0);
  assert.equal(Core.levelFor(s.xp).level, 1);
  assert.ok(!Number.isNaN(Core.levelFor(s.xp).progress));
  assert.deepEqual(Core.dueWords(s, '2026-10-03'), ['low', 'frac', 'nobox']);
  assert.ok(Array.isArray(Core.weakestWords(s)));
  assert.doesNotThrow(() => Core.recordActivity(s, { xp: 5, kind: 'lesson' }, at(2026, 10, 13)));
  assert.equal(s.xp, 5);
  assert.equal(s.streak.current, 1);
  assert.doesNotThrow(() => Core.evaluateProgress(s, DATA, at(2026, 10, 13)));
  assert.doesNotThrow(() => Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 13)));
});

test('migrate: settings validation', () => {
  const s = Core.migrate({ settings: { name: 'x'.repeat(100), dailyGoal: 25, autoplay: 'no', sfx: false, slowAudio: 1, unlockAll: true, theme: 'neon' } });
  assert.equal(s.settings.name.length, 24);
  assert.equal(s.settings.dailyGoal, 20, 'non-GOALS value falls back to default');
  assert.equal(s.settings.autoplay, true);
  assert.equal(s.settings.sfx, false);
  assert.equal(s.settings.slowAudio, false);
  assert.equal(s.settings.unlockAll, true);
  assert.equal(s.settings.theme, 'auto');
  for (const g of Core.GOALS) assert.equal(Core.migrate({ settings: { dailyGoal: g.xp } }).settings.dailyGoal, g.xp);
  assert.equal(Core.migrate({ settings: { dailyGoal: '50' } }).settings.dailyGoal, 20);
  for (const t of ['auto', 'light', 'dark']) assert.equal(Core.migrate({ settings: { theme: t } }).settings.theme, t);
  assert.equal(Core.migrate({ settings: { name: 42 } }).settings.name, '');
});

test('migrate: prototype-pollution keys do not leak', () => {
  const raw = JSON.parse('{"__proto__": {"polluted": 1}, "units": {"__proto__": {"completed": true}}, "words": {"__proto__": {"box": 2, "due": "2026-10-01"}}, "achievements": {"__proto__": "2026-10-01"}, "settings": {"__proto__": {"x": 1}}}');
  let s;
  assert.doesNotThrow(() => { s = Core.migrate(raw); });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.completed, undefined);
  assert.equal(Object.prototype.box, undefined);
  assert.equal(s.polluted, undefined);
  assert.deepEqual(Core.dueWords(s, '2026-12-01'), []);
  assert.equal(Core.completedUnits(s, DATA), 0);
});

test('migrate is idempotent on a real state', () => {
  const s = fresh();
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  Core.completeReview(s, DATA, [{ item: 'u01-01', type: 'type', correct: true }], at(2026, 10, 2));
  Core.completeListening(s, DATA, { correct: 3, total: 4 }, at(2026, 10, 2, 13), 5);
  const round = Core.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(round, s);
  for (const d of Object.values(s.daily)) assert.equal(typeof d.listening, 'number', 'daily entries always carry listening');
  assert.deepEqual(Core.migrate(round), round, 'second pass is a no-op');
  assert.deepEqual(Core.migrate(JSON.parse(JSON.stringify(round))), round);
});

// ---------------------------------------------------------------- levels
test('levelFor thresholds and progress', () => {
  assert.deepEqual(Core.levelFor(0), { level: 1, name: 'Débutant', floor: 0, next: 50, progress: 0 });
  assert.equal(Core.levelFor(49).level, 1);
  assert.equal(Core.levelFor(25).progress, 0.5);
  assert.equal(Core.levelFor(50).level, 2);
  assert.equal(Core.levelFor(50).progress, 0);
  assert.equal(Core.levelFor(100).progress, 0.5);
  assert.equal(Core.levelFor(149).level, 2);
  assert.equal(Core.levelFor(150).level, 3);
  for (const [i, [floor]] of Core.LEVELS.entries()) {
    assert.equal(Core.levelFor(floor).level, i + 1);
    if (floor > 0) assert.equal(Core.levelFor(floor - 1).level, i);
  }
  const top = Core.levelFor(3000);
  assert.equal(top.level, 10);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
  assert.equal(Core.levelFor(99999).level, 10);
});

// ---------------------------------------------------------------- data integrity
test('data integrity: unique ids, audio and cover files exist', () => {
  const ids = new Set();
  const missing = [];
  for (const u of DATA.units) {
    if (!fs.existsSync(path.join(ROOT, 'assets/img/units', `${u.cover}.svg`))) missing.push(`cover ${u.cover}.svg`);
    assert.ok(u.items.length >= 4, `${u.id} needs >= 4 items for match`);
    for (const it of u.items) {
      assert.ok(!ids.has(it.id), `duplicate id ${it.id}`);
      ids.add(it.id);
      assert.ok(it.id.startsWith(u.id + '-'), `${it.id} prefix`);
      for (const f of [`${it.id}.m4a`, `${it.id}-ex.m4a`]) {
        const p = path.join(ROOT, 'assets/audio', f);
        if (!fs.existsSync(p) || fs.statSync(p).size === 0) missing.push(f);
      }
    }
  }
  assert.deepEqual(missing, []);
  const milestoneAfters = DATA.milestones.map((m) => m.after);
  assert.ok(milestoneAfters.every((a) => a <= DATA.units.length));
});

// ---------------------------------------------------------------- typing modes / spelling helpers
const ITEMS = Core.allItems(DATA);
const lettersOf = (w) => Core.letterSlots(w).filter((s) => !s.given).map((s) => s.ch);
const sorted = (a) => a.slice().sort();
// Puts tiles back into the word's letter slots, keeping given characters in place.
const reassemble = (word, tiles) => {
  let i = 0;
  return Core.letterSlots(word).map((s) => (s.given ? s.ch : tiles[i++])).join('');
};

test('TYPING_MODES and default typing setting', () => {
  assert.deepEqual(Core.TYPING_MODES, ['tiles', 'keyboard', 'off']);
  assert.equal(fresh().settings.typing, 'tiles');
});

test('migrate: keeps a valid settings.typing, otherwise falls back to tiles', () => {
  for (const m of Core.TYPING_MODES) assert.equal(Core.migrate({ settings: { typing: m } }).settings.typing, m);
  for (const bad of [undefined, null, '', 'TILES', 'voice', 1, true, {}, ['off']]) {
    assert.equal(Core.migrate({ settings: { typing: bad } }).settings.typing, 'tiles', `typing=${String(bad)}`);
  }
  assert.equal(Core.migrate({}).settings.typing, 'tiles');
  assert.equal(Core.migrate({ settings: 'junk' }).settings.typing, 'tiles');
});

test('letterSlots: letters vs given characters', () => {
  assert.deepEqual(Core.letterSlots("c'est ?").map((s) => s.given), [false, true, false, false, false, true, true]);
  assert.deepEqual(Core.letterSlots('l\'œuf').filter((s) => !s.given).map((s) => s.ch), ['l', 'œ', 'u', 'f']);
  assert.deepEqual(Core.letterSlots('grand-mère').filter((s) => s.given).map((s) => s.ch), ['-']);
  assert.deepEqual(Core.letterSlots('é').map((s) => s.given), [false]);
  assert.deepEqual(Core.letterSlots(''), []);
  for (const it of ITEMS) assert.equal(Core.letterSlots(it.fr).map((s) => s.ch).join(''), it.fr, it.id);
});

test('spellingTiles: every item gives exactly its letters, reassembling to the word', () => {
  for (const it of ITEMS) {
    for (const seed of [1, 2, 3]) {
      const tiles = Core.spellingTiles(it.fr, Core.mulberry32(seed));
      assert.deepEqual(sorted(tiles), sorted(lettersOf(it.fr)), it.id);
      assert.equal(reassemble(it.fr, lettersOf(it.fr)), it.fr, it.id);
      // Tiles placed in the right order make an exact answer.
      const answer = reassemble(it.fr, lettersOf(it.fr));
      assert.equal(Core.checkAnswer(answer, it.fr), 'exact', it.id);
    }
  }
});

test('spellingTiles: never in original order for words with >= 2 distinct letters', () => {
  const failures = [];
  for (const it of ITEMS) {
    const letters = lettersOf(it.fr);
    if (new Set(letters).size < 2) continue;
    for (let seed = 1; seed <= 20; seed++) {
      const tiles = Core.spellingTiles(it.fr, Core.mulberry32(seed));
      if (tiles.join('') === letters.join('')) failures.push(`${it.fr}@${seed}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('spellingTiles: degenerate inputs', () => {
  assert.deepEqual(Core.spellingTiles('', Core.mulberry32(1)), []);
  assert.deepEqual(Core.spellingTiles('a', Core.mulberry32(1)), ['a']);
  assert.deepEqual(Core.spellingTiles('aa', Core.mulberry32(1)), ['a', 'a']);
  assert.deepEqual(Core.spellingTiles(" ' ? ", Core.mulberry32(1)), []);
});

test('revealPrefix: examples and bounds for every item', () => {
  assert.equal(Core.revealPrefix("c'est combien ?", 1), "c'");
  assert.equal(Core.revealPrefix("c'est combien ?", 2), "c'e");
  assert.equal(Core.revealPrefix("c'est combien ?", 4), "c'est ");
  assert.equal(Core.revealPrefix('bonjour', 3), 'bon');
  for (const it of ITEMS) {
    const total = lettersOf(it.fr).length;
    assert.equal(Core.revealPrefix(it.fr, 0), '', it.id);
    assert.equal(Core.revealPrefix(it.fr, total), it.fr, it.id);
    assert.equal(Core.revealPrefix(it.fr, total + 5), it.fr, it.id);
    let prev = '';
    for (let n = 0; n <= total; n++) {
      const p = Core.revealPrefix(it.fr, n);
      assert.ok(it.fr.startsWith(p), `${it.id} n=${n}`);
      assert.equal(lettersOf(p).length, n, `${it.id} n=${n}`);
      assert.ok(p.length >= prev.length, `${it.id} monotonic`);
      // Prefix ends on a letter, or includes given chars that follow it.
      if (n > 0 && n < total) assert.ok(!Core.letterSlots(it.fr)[p.length].given, `${it.id} n=${n} stops before next letter`);
      prev = p;
    }
  }
});

test('asChoice: valid mc-en-fr for every item, retry preserved', () => {
  for (const it of ITEMS) {
    for (const retry of [undefined, true]) {
      const ex = Core.asChoice(DATA, { type: 'type', item: it.id, retry }, Core.mulberry32(it.id.length + 3));
      assert.equal(ex.type, 'mc-en-fr', it.id);
      assert.equal(ex.item, it.id);
      assert.equal(ex.retry, retry);
      assert.equal(ex.options.length, 4, it.id);
      assert.equal(ex.options.filter((o) => o.id === it.id).length, 1, it.id);
      assert.equal(ex.options.find((o) => o.id === it.id).text, it.fr);
      assert.equal(new Set(ex.options.map((o) => o.text)).size, 4, `${it.id} distinct texts`);
      assert.equal(new Set(ex.options.map((o) => o.id)).size, 4, `${it.id} distinct ids`);
      for (const o of ex.options) assert.equal(Core.findItem(DATA, o.id).fr, o.text);
    }
  }
});

// ---------------------------------------------------------------- pronunciation
const score = Core.pronunciationScore;
const level = (h, t) => Core.pronunciationLevel(score(h, t));

test('pronunciationLevel thresholds', () => {
  assert.equal(Core.pronunciationLevel(1), 'great');
  assert.equal(Core.pronunciationLevel(0.9), 'great');
  assert.equal(Core.pronunciationLevel(0.8999), 'close');
  assert.equal(Core.pronunciationLevel(0.85), 'close');
  assert.equal(Core.pronunciationLevel(0.6), 'close');
  assert.equal(Core.pronunciationLevel(0.5999), 'retry');
  assert.equal(Core.pronunciationLevel(0), 'retry');
});

test('frenchSound: homophones share a key, applied identically to both sides', () => {
  const k = Core.frenchSound;
  assert.equal(k('verre'), k('vert'));
  assert.equal(k('vers'), k('vert'));
  assert.equal(k('pin'), k('pain'));
  assert.equal(k('eau'), 'o');
  assert.equal(k('au'), 'o');
  assert.equal(k('Vert!'), k('vert'));
  assert.notEqual(k('chien'), k('chat'));
  // Pronounced final consonants are kept.
  assert.equal(k('sept'), 'set');
  assert.equal(k('six'), 'sis');
  assert.notEqual(k('cet'), k('sept'));
});

test('pronunciation: recogniser variants of the right answer are "great"', () => {
  const cases = [
    ['Bonjour!', 'bonjour'], ['BONJOUR', 'bonjour'], ['Comment ça va?', 'comment ça va ?'],
    ['verre', 'vert'], ['vers', 'vert'], ['pin', 'pain'], ['au', 'eau'],
    ['Le chat.', 'le chat'], ['chat', 'le chat'], ['oeuf', "l'œuf"], ['œuf', "l'œuf"], ["l'oeuf", "l'œuf"],
    ['comment ca va', 'comment ça va ?'],
  ];
  for (const [h, t] of cases) assert.equal(level(h, t), 'great', `${h} -> ${t}: ${score(h, t)}`);
  // Exact matches are perfect; a dropped article costs a little but stays below 1.
  assert.equal(score('Le chat.', 'le chat'), 1);
  const dropped = score('chat', 'le chat');
  assert.ok(dropped < 1 && dropped >= 0.9, String(dropped));
  // Every course item with its article dropped is still "great".
  for (const it of ITEMS) {
    const bare = Core.normalize(it.fr).replace(/^(?:les|le|la|une|un|des) +|^l'\s*/, '');
    if (bare && bare !== Core.normalize(it.fr)) assert.equal(level(bare, it.fr), 'great', `${bare} -> ${it.fr}: ${score(bare, it.fr)}`);
  }
});

test('pronunciation: every course item scores 1 against itself and "great" uppercased with a full stop', () => {
  for (const it of ITEMS) {
    assert.equal(score(it.fr, it.fr), 1, it.id);
    const s = score(it.fr.toUpperCase() + '.', it.fr);
    assert.equal(Core.pronunciationLevel(s), 'great', `${it.id} ${it.fr}: ${s}`);
  }
});

test('pronunciation: wrong words are not "great"', () => {
  assert.notEqual(level('le chien', 'le chat'), 'great');
  assert.notEqual(level("l'eau", "l'œuf"), 'great');
  assert.notEqual(level('bonsoir', 'bonjour'), 'great');
  assert.notEqual(level('cet', 'sept'), 'great');
  assert.notEqual(level('fromage', "l'eau"), 'great');
  assert.notEqual(level('le fils', 'la fille'), 'great');
  // Extra speech around the target lowers the score: "close", not "great".
  assert.equal(level('Le chat dort.', 'le chat'), 'close');
  assert.equal(level('merci beaucoup', 'merci'), 'close');
  assert.equal(level('blah blah fromage', 'le fromage'), 'close');
  assert.equal(score('', 'bonjour'), 0);
  assert.equal(score('   ', 'bonjour'), 0);
});

test('pronunciation: no same-unit wrong-word pair reaches "great"', () => {
  let pairs = 0;
  const great = [];
  for (const u of DATA.units) {
    for (const a of u.items) for (const b of u.items) {
      if (a === b || a.fr === b.fr) continue;
      pairs++;
      const s = score(a.fr, b.fr); // heard a, target b
      if (Core.pronunciationLevel(s) === 'great') great.push(`${u.id}: "${a.fr}" for "${b.fr}" = ${s.toFixed(3)}`);
    }
  }
  if (great.length) console.log(`# ${great.length}/${pairs} wrong-word pairs score great:\n# ` + great.join('\n# '));
  assert.ok(pairs > 0);
  assert.deepEqual(great, [], `${great.length}/${pairs} wrong pairs are "great"`);
});

test('pronunciation: score always in [0,1] and never throws on odd input', () => {
  const odd = ['', ' ', '?!', '...', "'", '-', '🎤', '👋 bonjour 👋', 'a'.repeat(5000), 'le '.repeat(500),
    'bla '.repeat(500) + 'bonjour', '\u0000', '\n\t', 'ÇA VA ?', 'l’œuf', '123', null, undefined, 42];
  const targets = ['bonjour', 'le chat', "l'œuf", 'comment ça va ?', '', '?', ...ITEMS.slice(0, 5).map((i) => i.fr)];
  for (const h of odd) for (const t of targets) {
    let s;
    assert.doesNotThrow(() => { s = score(h, t); }, `${String(h).slice(0, 20)} / ${t}`);
    assert.ok(typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1, `${String(h).slice(0, 20)} / ${t}: ${s}`);
    assert.ok(['great', 'close', 'retry'].includes(Core.pronunciationLevel(s)));
  }
  for (const it of ITEMS) for (const h of ['', '?!', '🎤']) assert.equal(score(h, it.fr), 0, `${JSON.stringify(h)} / ${it.fr}`);
});

test('speaking: default setting, migration, spokenGood stat and speak-10 achievement', () => {
  const d = fresh();
  assert.equal(d.settings.speaking, true);
  assert.equal(d.stats.spokenGood, 0);
  assert.equal(Core.migrate({}).settings.speaking, true);
  assert.equal(Core.migrate({ settings: { speaking: false } }).settings.speaking, false);
  assert.equal(Core.migrate({ settings: { speaking: true } }).settings.speaking, true);
  for (const bad of ['no', 0, 1, null, 'false', {}]) assert.equal(Core.migrate({ settings: { speaking: bad } }).settings.speaking, true, String(bad));
  assert.equal(Core.migrate({ stats: { spokenGood: 7 } }).stats.spokenGood, 7);
  assert.equal(Core.migrate({ stats: { spokenGood: -3 } }).stats.spokenGood, 0);
  assert.equal(Core.migrate({ stats: { lessons: 2 } }).stats.spokenGood, 0); // old saves without the field

  const s = fresh();
  s.stats.spokenGood = 9;
  let r = Core.evaluateProgress(s, DATA, at(2026, 10, 14));
  assert.ok(!r.achievements.some((a) => a.id === 'speak-10'));
  assert.equal(s.achievements['speak-10'], undefined);
  s.stats.spokenGood = 10;
  r = Core.evaluateProgress(s, DATA, at(2026, 10, 14));
  assert.equal(r.achievements.filter((a) => a.id === 'speak-10').length, 1);
  assert.equal(s.achievements['speak-10'], '2026-10-14');
  r = Core.evaluateProgress(s, DATA, at(2026, 10, 15));
  assert.ok(!r.achievements.some((a) => a.id === 'speak-10'), 'unlocks once');
  assert.equal(s.achievements['speak-10'], '2026-10-14');
});

// ---------------------------------------------------------------- course structure (stages, grammar, dialogue)
const GRAMMAR = DATA.units.filter((u) => u.kind === 'grammar');
const DIALOGUE = DATA.units.filter((u) => u.kind === 'dialogue');
const audioOk = (id) => {
  const p = path.join(ROOT, 'assets/audio', `${id}.m4a`);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
};
// Every audio id the course needs, following scripts/generate-audio.mjs naming.
const audioIds = () => {
  const ids = [];
  for (const u of DATA.units) {
    for (const it of u.items) ids.push(it.id, `${it.id}-ex`);
    if (u.grammar) {
      u.grammar.sections.flatMap((s) => s.examples || []).forEach((_, i) => ids.push(`${u.id}-x${i + 1}`));
      u.grammar.drills.forEach((_, i) => ids.push(`${u.id}-d${i + 1}`));
    }
    if (u.dialogue) u.dialogue.lines.forEach((_, i) => ids.push(`${u.id}-l${i + 1}`));
  }
  return ids;
};

test('data: stages cover every unit exactly once, in order; every unit has its stage', () => {
  assert.ok(Array.isArray(DATA.stages) && DATA.stages.length >= 1);
  assert.equal(DATA.units.length, 25);
  const listed = DATA.stages.flatMap((st) => st.units);
  assert.deepEqual(listed, DATA.units.map((u) => u.id), 'stage lists, concatenated, equal the unit order');
  assert.equal(new Set(listed).size, listed.length, 'no unit listed twice');
  assert.equal(new Set(DATA.units.map((u) => u.id)).size, DATA.units.length, 'unique unit ids');
  for (const st of DATA.stages) for (const id of st.units) {
    assert.equal(DATA.units.find((u) => u.id === id).stage, st.id, id);
  }
  assert.ok(DATA.stages.some((st) => st.id === 'a1'));
  assert.equal(typeof DATA.voiceCA, 'string');
  assert.ok(DATA.voiceCA.length > 0);
  for (const u of DATA.units) assert.ok([undefined, 'grammar', 'dialogue'].includes(u.kind), `${u.id} kind ${u.kind}`);
  assert.ok(GRAMMAR.length > 0 && DIALOGUE.length > 0);
});

test('data: milestones are a1-m1..a1-m4, increasing and within the unit count', () => {
  assert.deepEqual(DATA.milestones.map((m) => m.id), ['a1-m1', 'a1-m2', 'a1-m3', 'a1-m4']);
  assert.deepEqual(DATA.milestones.map((m) => m.after), [7, 15, 21, 25]);
  let prev = 0;
  for (const m of DATA.milestones) {
    assert.ok(Number.isInteger(m.after) && m.after > prev && m.after <= DATA.units.length, m.id);
    prev = m.after;
  }
});

test('data: item images are well-formed (incl. new num / clock kinds)', () => {
  for (const it of ITEMS) {
    const keys = Object.keys(it.img || {});
    assert.equal(keys.length, 1, `${it.id} has one image kind`);
    const [k] = keys;
    const v = it.img[k];
    assert.ok(['emoji', 'dots', 'swatch', 'num', 'clock'].includes(k), `${it.id}: ${k}`);
    if (k === 'num') assert.match(v, /^\d+$/, it.id);
    if (k === 'clock') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v);
      assert.ok(m && +m[1] < 24 && +m[2] < 60, `${it.id}: ${v}`);
    }
  }
});

test('data: every grammar unit is well-formed', () => {
  for (const u of GRAMMAR) {
    const g = u.grammar;
    assert.ok(g && Array.isArray(g.sections) && g.sections.length >= 1, `${u.id} sections`);
    for (const [i, sec] of g.sections.entries()) {
      const tag = `${u.id} section ${i}`;
      assert.ok(typeof sec.h === 'string' && sec.h.trim(), `${tag}: heading`);
      if (sec.p !== undefined) assert.ok(typeof sec.p === 'string' && sec.p.trim(), `${tag}: p`);
      for (const k of ['table', 'examples']) {
        if (sec[k] === undefined) continue;
        assert.ok(Array.isArray(sec[k]) && sec[k].length > 0, `${tag}: ${k}`);
        for (const row of sec[k]) {
          const ok = Array.isArray(row) && row.length === 2 && row.every((c) => typeof c === 'string') && row[0].trim()
            // Tables may leave the second cell blank as filler (e.g. n01's two-column number grid); examples may not.
            && (k === 'table' || row[1].trim());
          assert.ok(ok, `${tag}: ${k} row ${JSON.stringify(row)}`);
        }
      }
      assert.ok(sec.p || sec.table || sec.examples, `${tag}: has content`);
    }
    assert.ok(Array.isArray(g.drills) && g.drills.length >= 6, `${u.id}: at least 6 drills for a lesson`);
    for (const [i, d] of g.drills.entries()) {
      const tag = `${u.id} drill ${i}`;
      assert.equal(d.length, 4, tag);
      const [sentence, answer, options, en] = d;
      assert.equal(sentence.split('___').length - 1, 1, `${tag}: exactly one blank`);
      assert.ok(typeof answer === 'string' && answer.trim(), tag);
      assert.ok(Array.isArray(options) && options.length >= 2, `${tag}: >= 2 options`);
      assert.equal(new Set(options).size, options.length, `${tag}: unique options`);
      assert.ok(options.includes(answer), `${tag}: answer among options`);
      assert.ok(typeof en === 'string' && en.trim(), `${tag}: english`);
    }
  }
});

test('data: every dialogue is well-formed', () => {
  for (const u of DIALOGUE) {
    const d = u.dialogue;
    assert.ok(typeof d.scene === 'string' && d.scene.trim(), `${u.id} scene`);
    const speakers = Object.keys(d.speakers);
    assert.ok(speakers.length >= 2, `${u.id} speakers`);
    for (const k of speakers) {
      const [name, voice] = d.speakers[k];
      assert.ok(typeof name === 'string' && name.trim(), `${u.id} ${k} name`);
      assert.ok(typeof voice === 'string' && voice.trim(), `${u.id} ${k} voice`);
    }
    assert.ok(d.lines.length >= 2, `${u.id} lines`);
    for (const [i, line] of d.lines.entries()) {
      assert.equal(line.length, 3, `${u.id} line ${i}`);
      assert.ok(speakers.includes(line[0]), `${u.id} line ${i}: speaker ${line[0]} exists`);
      assert.ok(line[1].trim() && line[2].trim(), `${u.id} line ${i}: text`);
    }
    for (const k of speakers) assert.ok(d.lines.some((l) => l[0] === k), `${u.id}: ${k} speaks`);
    assert.ok(d.questions.length >= 1, `${u.id} questions`);
    for (const [i, q] of d.questions.entries()) {
      const tag = `${u.id} question ${i}`;
      assert.equal(q.length, 4, tag);
      const [qfr, qen, options, correct] = q;
      assert.ok(qfr.trim() && qen.trim(), tag);
      assert.ok(Array.isArray(options) && options.length >= 2, `${tag}: options`);
      assert.equal(new Set(options).size, options.length, `${tag}: unique options`);
      assert.ok(Number.isInteger(correct) && correct >= 0 && correct < options.length, `${tag}: correctIndex`);
    }
  }
});

test('data: every audio clip exists and is listed in the manifest; every cover SVG exists', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/manifest.json'), 'utf8'));
  const ids = audioIds();
  assert.equal(new Set(ids).size, ids.length, 'audio ids are unique');
  assert.deepEqual(ids.filter((id) => !audioOk(id)), [], 'missing audio files');
  assert.deepEqual(ids.filter((id) => !(id in manifest)), [], 'missing manifest entries');
  const covers = DATA.units.filter((u) => !fs.existsSync(path.join(ROOT, 'assets/img/units', `${u.cover}.svg`))).map((u) => u.cover);
  assert.deepEqual(covers, []);
});

test('data: manifest text for drills / dialogue lines matches drillSpeech / line text', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/manifest.json'), 'utf8'));
  const text = (id) => String(manifest[id]).split('|').slice(2).join('|');
  const bad = [];
  for (const u of GRAMMAR) u.grammar.drills.forEach((d, i) => { if (text(`${u.id}-d${i + 1}`) !== Core.drillSpeech(d)) bad.push(`${u.id}-d${i + 1}`); });
  for (const u of DIALOGUE) u.dialogue.lines.forEach((l, i) => { if (text(`${u.id}-l${i + 1}`) !== l[1]) bad.push(`${u.id}-l${i + 1}`); });
  assert.deepEqual(bad, [], 'stale audio (manifest text differs from current data)');
});

// ---------------------------------------------------------------- drillSpeech
test('drillSpeech: fills the blank, strips hints, joins elisions, bare answer for "n = ___"', () => {
  assert.equal(Core.drillSpeech(['Je ___ ingénieur.', 'suis']), 'Je suis ingénieur.');
  assert.equal(Core.drillSpeech(['Il est ___. (7 h 30)', 'sept heures et demie']), 'Il est sept heures et demie.');
  assert.equal(Core.drillSpeech(['Le billet coûte ___ dollars. (95)', 'quatre-vingt-quinze']), 'Le billet coûte quatre-vingt-quinze dollars.');
  assert.equal(Core.drillSpeech(['On va ___ hôpital.', "à l'"]), "On va à l'hôpital.");
  assert.equal(Core.drillSpeech(['___ école est grande.', "L'"]), "L'école est grande.");
  assert.equal(Core.drillSpeech(['17 = ___', 'dix-sept']), 'dix-sept');
  assert.equal(Core.drillSpeech(['100 = ___', 'cent']), 'cent');
  assert.equal(Core.drillSpeech(['Quatre plus ___ = dix', 'six']), 'Quatre plus six = dix', 'only the pure "n = ___" form is reduced');
});

test('drillSpeech: no blank, hint or dangling elision left in any course drill', () => {
  for (const u of GRAMMAR) for (const [i, d] of u.grammar.drills.entries()) {
    const sp = Core.drillSpeech(d);
    const tag = `${u.id} drill ${i}: ${sp}`;
    assert.ok(!sp.includes('___'), tag);
    assert.ok(!/[()]/.test(sp), tag);
    assert.ok(!/' /.test(sp), tag);
    assert.ok(sp.includes(d[1].replace(/'$/, '')), `${tag} contains answer`);
    assert.equal(sp, sp.trim(), tag);
  }
});

// ---------------------------------------------------------------- buildLesson: grammar drills
test('buildLesson: grammar units get exactly 6 valid fill drills for many seeds', () => {
  for (const u of GRAMMAR) {
    for (let seed = 1; seed <= 40; seed++) {
      const ex = Core.buildLesson(DATA, u.id, Core.mulberry32(seed * 7919));
      const fills = ex.filter((e) => e.type === 'fill');
      const tag = `${u.id} seed ${seed}`;
      assert.equal(fills.length, 6, tag);
      assert.equal(new Set(fills.map((f) => f.drill)).size, 6, `${tag}: distinct drills`);
      for (const f of fills) {
        assert.equal(f.unit, u.id, tag);
        assert.ok(Number.isInteger(f.drill) && f.drill >= 0 && f.drill < u.grammar.drills.length, `${tag}: drill index`);
        const opts = u.grammar.drills[f.drill][2];
        assert.notEqual(f.options, opts, `${tag}: options are a copy`);
        assert.deepEqual(f.options.slice().sort(), opts.slice().sort(), `${tag}: same option set`);
      }
    }
  }
  // Non-grammar units (incl. dialogues) have no fill drills.
  for (const u of DATA.units.filter((x) => !x.grammar)) {
    assert.equal(Core.buildLesson(DATA, u.id, Core.mulberry32(3)).filter((e) => e.type === 'fill').length, 0, u.id);
  }
  // Data is not mutated by shuffling.
  const before = JSON.stringify(GRAMMAR.map((u) => u.grammar.drills));
  for (const u of GRAMMAR) Core.buildLesson(DATA, u.id, Core.mulberry32(5));
  assert.equal(JSON.stringify(GRAMMAR.map((u) => u.grammar.drills)), before);
});

test('buildLesson: grammar lessons are deterministic for a seed', () => {
  for (const u of GRAMMAR) assert.deepEqual(Core.buildLesson(DATA, u.id, Core.mulberry32(11)), Core.buildLesson(DATA, u.id, Core.mulberry32(11)), u.id);
});

// ---------------------------------------------------------------- unitUnlocked / stageProgress
test('unitUnlocked: a completed unit stays unlocked even if its predecessor is not done (reordering)', () => {
  const s = fresh();
  const last = DATA.units.length - 1;
  // Simulate a save from the old order: a late unit completed, its predecessor not.
  s.units[DATA.units[5].id] = { completed: true, bestScore: 1, stars: 3, plays: 1 };
  assert.equal(Core.unitUnlocked(s, DATA, 5), true, 'completed unit itself');
  assert.equal(Core.unitUnlocked(s, DATA, 6), true, 'next after a completed unit');
  assert.equal(Core.unitUnlocked(s, DATA, 4), false, 'predecessor not done and not completed');
  assert.equal(Core.unitUnlocked(s, DATA, 7), false);
  assert.equal(Core.unitUnlocked(s, DATA, last), false);
  // Incomplete (completed:false) entries do not unlock anything.
  s.units[DATA.units[9].id] = { completed: false, bestScore: 0.5, stars: 1, plays: 1 };
  assert.equal(Core.unitUnlocked(s, DATA, 9), false);
  assert.equal(Core.unitUnlocked(s, DATA, 10), false);
  // Every unit is reachable by completing the path in order.
  const t = fresh();
  DATA.units.forEach((u, i) => {
    assert.equal(Core.unitUnlocked(t, DATA, i), true, `${u.id} unlocked in order`);
    if (i + 1 < DATA.units.length) assert.equal(Core.unitUnlocked(t, DATA, i + 1), false, `${DATA.units[i + 1].id} locked before ${u.id}`);
    Core.completeLesson(t, DATA, u.id, allCorrect(u), at(2026, 10, 1));
  });
});

test('stageProgress counts completed units of a stage', () => {
  const s = fresh();
  assert.deepEqual(Core.stageProgress(s, DATA, 'a1'), { done: 0, total: 25 });
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  s.units.g01 = { completed: false, bestScore: 0.4, stars: 1, plays: 1 };
  s.units.zzz = { completed: true, bestScore: 1, stars: 3, plays: 1 }; // unknown id ignored
  assert.deepEqual(Core.stageProgress(s, DATA, 'a1'), { done: 1, total: 25 });
  DATA.units.forEach((u) => Core.completeLesson(s, DATA, u.id, allCorrect(u), at(2026, 10, 2)));
  assert.deepEqual(Core.stageProgress(s, DATA, 'a1'), { done: 25, total: 25 });
  assert.deepEqual(Core.stageProgress(s, DATA, 'nope'), { done: 0, total: 0 });
  for (const st of DATA.stages) assert.equal(Core.stageProgress(fresh(), DATA, st.id).total, st.units.length, st.id);
});

// ---------------------------------------------------------------- study minutes / listening
test('recordActivity: minutes are capped at 45 per activity and accumulate per day', () => {
  const s = fresh();
  Core.recordActivity(s, { xp: 1, kind: 'lesson', minutes: 10 }, at(2026, 10, 1, 9));
  Core.recordActivity(s, { xp: 1, kind: 'review', minutes: 300 }, at(2026, 10, 1, 10));
  Core.recordActivity(s, { xp: 1, kind: 'lesson', minutes: -20 }, at(2026, 10, 1, 11));
  Core.recordActivity(s, { xp: 1, kind: 'lesson' }, at(2026, 10, 1, 12));
  Core.recordActivity(s, { xp: 1, kind: 'lesson', minutes: 2.5 }, at(2026, 10, 1, 13));
  assert.equal(s.daily['2026-10-01'].minutes, 10 + 45 + 0 + 0 + 2.5);
  Core.recordActivity(s, { xp: 1, kind: 'lesson', minutes: 45 }, at(2026, 10, 2));
  Core.recordActivity(s, { xp: 1, kind: 'lesson', minutes: 46 }, at(2026, 10, 2, 13));
  assert.equal(s.daily['2026-10-02'].minutes, 90);
  assert.equal(s.daily['2026-10-01'].minutes, 57.5, 'other days untouched');
});

test('completeLesson / completeReview pass minutes through to the daily log', () => {
  const s = fresh();
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1, 9), 12);
  Core.completeReview(s, DATA, [{ item: 'u01-01', type: 'type', correct: true }], at(2026, 10, 1, 10), 100);
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1, 11)); // default 0
  const d = s.daily['2026-10-01'];
  assert.equal(d.minutes, 12 + 45);
  assert.equal(d.lessons, 2);
  assert.equal(d.reviews, 1);
  assert.equal(d.listening || 0, 0);
});

test('completeListening: XP = 2 + correct, stats, daily listening count and minutes', () => {
  const s = fresh();
  const before = { ...s.stats };
  const r = Core.completeListening(s, DATA, { correct: 3, total: 4 }, at(2026, 10, 5, 9), 6);
  assert.equal(r.xp, 5);
  assert.equal(typeof r.goalReachedNow, 'boolean');
  assert.ok(Array.isArray(r.achievements) && Array.isArray(r.milestones));
  assert.equal(s.xp, 5);
  assert.equal(s.stats.listenCorrect, before.listenCorrect + 3);
  assert.equal(s.stats.totalAnswered, before.totalAnswered + 4);
  assert.equal(s.stats.totalCorrect, before.totalCorrect + 3);
  assert.equal(s.stats.lessons, 0, 'not a lesson');
  assert.equal(s.stats.reviews, 0, 'not a review');
  const d = s.daily['2026-10-05'];
  assert.deepEqual(d, { xp: 5, lessons: 0, reviews: 0, minutes: 6, listening: 1 });
  assert.equal(s.streak.current, 1);
  const r2 = Core.completeListening(s, DATA, { correct: 0, total: 5 }, at(2026, 10, 5, 10), 999);
  assert.equal(r2.xp, 2);
  assert.equal(s.daily['2026-10-05'].listening, 2);
  assert.equal(s.daily['2026-10-05'].minutes, 6 + 45);
  assert.equal(s.stats.totalAnswered, 9);
  // Crossing the daily goal via listening counts.
  const g = fresh();
  g.settings.dailyGoal = 10;
  assert.equal(Core.completeListening(g, DATA, { correct: 4, total: 4 }, at(2026, 10, 5)).goalReachedNow, false);
  assert.equal(Core.completeListening(g, DATA, { correct: 4, total: 4 }, at(2026, 10, 5, 13)).goalReachedNow, true);
});

test('migrate keeps numeric minutes / listening and sanitises bad ones', () => {
  const s = Core.migrate({ daily: {
    '2026-10-01': { xp: 5, lessons: 1, reviews: 0, minutes: 17, listening: 2 },
    '2026-10-02': { xp: 5, minutes: 'lots', listening: -1 },
    '2026-10-03': { xp: 5 },
  } });
  assert.deepEqual(s.daily['2026-10-01'], { xp: 5, lessons: 1, reviews: 0, minutes: 17, listening: 2 });
  assert.equal(s.daily['2026-10-02'].minutes, 0);
  assert.equal(s.daily['2026-10-02'].listening, 0);
  assert.deepEqual(s.daily['2026-10-03'], { xp: 5, lessons: 0, reviews: 0, minutes: 0, listening: 0 });
  Core.recordActivity(s, { xp: 1, kind: 'listening', minutes: 3 }, at(2026, 10, 1, 15));
  assert.equal(s.daily['2026-10-01'].listening, 3);
  assert.equal(s.daily['2026-10-01'].minutes, 20);
});

// ---------------------------------------------------------------- pronunciation (new extra-words factor)
test('pronunciation: extra words around a target can be "close" but never "great"', () => {
  // Multi-word extras. (A single short filler such as "euh" after a long target can still reach
  // "great" through the whole-utterance similarity path; see report.)
  const extras = ['merci beaucoup', 'oui oui', 'alors voilà'];
  const greatHits = [];
  for (const it of ITEMS) for (const e of extras) {
    for (const h of [`${it.fr} ${e}`, `${e} ${it.fr}`]) {
      const sc = score(h, it.fr);
      if (Core.pronunciationLevel(sc) === 'great') greatHits.push(`${h} -> ${it.fr}: ${sc.toFixed(3)}`);
    }
  }
  assert.deepEqual(greatHits, []);
  assert.equal(level('Le chat dort.', 'le chat'), 'close');
});

test('pronunciation: no wrong-word pair across ALL course items reaches "great"', () => {
  const great = [];
  let pairs = 0;
  for (const a of ITEMS) for (const b of ITEMS) {
    if (a === b || Core.normalize(a.fr) === Core.normalize(b.fr)) continue;
    pairs++;
    const sc = score(a.fr, b.fr);
    if (Core.pronunciationLevel(sc) === 'great') great.push(`"${a.fr}" (${a.id}) for "${b.fr}" (${b.id}) = ${sc.toFixed(3)}`);
  }
  assert.ok(pairs > 10000);
  assert.deepEqual(great, [], `${great.length}/${pairs} cross-unit wrong pairs are "great"`);
});

test('frenchSound: silent endings, soft g, and contrasts that must stay distinct', () => {
  const k = Core.frenchSound;
  assert.ok(k('la neige').includes('j'), `soft g: ${k('la neige')}`);
  assert.notEqual(k('ils sont'), k('ils ont'));
  assert.notEqual(k('grande'), k('grand'));
  assert.notEqual(k('comment'), k('commencer'));
  assert.notEqual(k('travailler'), k('le travail'));
  assert.equal(k('parler'), k('parlez'), '-er / -ez sound alike');
  assert.equal(k('parler'), k('parlé'));
  assert.equal(k('vert'), k('verre'), 'existing homophones kept');
});

// ---------------------------------------------------------------- gender (le / la)
test('genderOf reads the article, or the note for l\' nouns', () => {
  assert.equal(Core.genderOf({ fr: 'le chat' }), 'm');
  assert.equal(Core.genderOf({ fr: 'la pomme' }), 'f');
  assert.equal(Core.genderOf({ fr: "l'eau", note: "feminine: l'eau (f)" }), 'f');
  assert.equal(Core.genderOf({ fr: "l'oiseau", note: 'masculine; plural: les oiseaux' }), 'm');
  assert.equal(Core.genderOf({ fr: "l'école", note: 'feminine' }), 'f');
  assert.equal(Core.genderOf({ fr: "l'argent comptant" }), null);
  assert.equal(Core.genderOf({ fr: 'bonjour' }), null);
  assert.equal(Core.genderOf({ fr: 'les yeux' }), null);
  assert.equal(Core.bareNoun('le chat'), 'chat');
  assert.equal(Core.bareNoun("l'œuf"), 'œuf');
  assert.equal(Core.bareNoun('la grand-mère'), 'grand-mère');
});

test('buildLesson: gender sort has 4 distinct nouns of both genders from the unit', () => {
  let units = 0;
  for (const unit of DATA.units) {
    for (const seed of [1, 2, 3, 42, 777]) {
      const g = Core.buildLesson(DATA, unit.id, Core.mulberry32(seed)).filter((e) => e.type === 'gender');
      const nouns = unit.items.filter((it) => Core.genderOf(it));
      const eligible = nouns.some((it) => Core.genderOf(it) === 'm') && nouns.some((it) => Core.genderOf(it) === 'f') && nouns.length >= 4;
      assert.equal(g.length, eligible ? 1 : 0, `${unit.id} seed ${seed}`);
      if (!g.length) continue;
      if (seed === 1) units++;
      const items = g[0].pairs.map((id) => unit.items.find((it) => it.id === id));
      assert.equal(new Set(g[0].pairs).size, 4);
      assert.ok(items.every(Boolean), 'nouns from this unit');
      const gs = items.map(Core.genderOf);
      assert.ok(gs.includes('m') && gs.includes('f'), 'both genders');
    }
  }
  assert.ok(units >= 4, `gender sort appears in several units (${units})`);
});

// ---------------------------------------------------------------- dictation
test('checkDictation: exact, accent-only and wrong, ignoring case and punctuation', () => {
  assert.equal(Core.checkDictation('bonjour madame', 'Bonjour, madame !').result, 'exact');
  assert.equal(Core.checkDictation("je bois de l' eau", "Je bois de l'eau.").result, 'exact');
  assert.equal(Core.checkDictation("l'ecole est fermee", "L'école est fermée.").result, 'accent');
  assert.equal(Core.checkDictation('', 'Le chat dort.').result, 'wrong');
  assert.equal(Core.checkDictation('le chien dort', 'Le chat dort.').result, 'wrong');
  assert.equal(Core.checkDictation('le chat dort bien', 'Le chat dort.').result, 'wrong');
});

test('checkDictation marks each target word, aligned past a missing word', () => {
  const r = Core.checkDictation('je mange pomme', 'Je mange une pomme.');
  assert.deepEqual(r.words.map((w) => w.mark), ['ok', 'ok', 'miss', 'ok']);
  assert.deepEqual(r.words.map((w) => w.w), ['Je', 'mange', 'une', 'pomme.']);
  const a = Core.checkDictation("l'ecole est fermée", "L'école est fermée.");
  assert.deepEqual(a.words.map((w) => w.mark), ['accent', 'ok', 'ok']);
});

// ---------------------------------------------------------------- find the mistake
test('buildLesson: grammar units get 2 spot-the-mistake sentences with a wrong option', () => {
  for (const u of DATA.units.filter((x) => x.grammar)) {
    for (const seed of [1, 5, 9]) {
      const ex = Core.buildLesson(DATA, u.id, Core.mulberry32(seed));
      const fills = new Set(ex.filter((e) => e.type === 'fill').map((e) => e.drill));
      for (const s of ex.filter((e) => e.type === 'spot')) {
        const d = u.grammar.drills[s.drill];
        assert.ok(!fills.has(s.drill), `${u.id}: spot drill not also a fill drill`);
        assert.notEqual(s.wrong, d[1], `${u.id}: shown form is wrong`);
        assert.ok(d[2].includes(s.wrong), `${u.id}: wrong form is one of the options`);
        assert.ok(Core.spotDrill(d));
      }
    }
  }
  assert.equal(Core.spotDrill(['17 = ___', 'dix-sept', []]), false);
});

test('spotSegments puts the wrong form in place of the blank', () => {
  const segs = Core.spotSegments(['Ils ___ à Vancouver.', 'vont', ['vont', 'va']], 'va');
  assert.deepEqual(segs, [{ text: 'Ils', wrong: false, punct: false }, { text: 'va', wrong: true, punct: false }, { text: 'à', wrong: false, punct: false }, { text: 'Vancouver.', wrong: false, punct: false }]);
  assert.deepEqual(Core.spotSegments(['___ amie.', 'Mon', []], 'Ma').map((s) => s.text), ['Ma', 'amie.']);
  assert.deepEqual(Core.spotSegments(['Vous ___ bien ?', 'allez', []], 'vont').map((s) => s.punct), [false, false, false, true]);
});

// ---------------------------------------------------------------- role-play
test('roleplayTurns: one turn per line of the role, right answer among distinct options', () => {
  for (const u of DATA.units.filter((x) => x.dialogue)) {
    const lines = u.dialogue.lines;
    for (const seed of [1, 2, 3]) {
      const turns = Core.roleplayTurns(u.dialogue, 'B', Core.mulberry32(seed));
      assert.deepEqual(turns.map((t) => t.line), lines.map((l, k) => k).filter((k) => lines[k][0] === 'B'));
      for (const t of turns) {
        assert.ok(t.options.includes(t.line), `${u.id}: answer present`);
        assert.ok(t.options.length >= 2 && t.options.length <= 3, `${u.id}: 2–3 options`);
        assert.equal(new Set(t.options.map((k) => lines[k][1])).size, t.options.length, `${u.id}: distinct texts`);
        assert.ok(t.options.every((k) => lines[k][0] === 'B'), `${u.id}: options are your own lines`);
        if (t.prompt !== null) { assert.equal(t.prompt, t.line - 1); assert.equal(lines[t.prompt][0], 'A'); }
      }
    }
  }
});

test('checkDictation: a wrong accent that changes the word is a mistake', () => {
  assert.equal(Core.checkDictation('il à faim', 'Il a faim.').result, 'wrong');
  assert.equal(Core.checkDictation('ou est la gare', 'Où est la gare ?').result, 'wrong');
  assert.equal(Core.checkDictation('le chat est la', 'Le chat est là.').result, 'wrong');
  assert.equal(Core.checkDictation('le cafe est chaud', 'Le café est chaud.').result, 'accent');
});

test('spotSegments: bracketed hints are shown but not pickable; notSpot forms never shown as the mistake', () => {
  const segs = Core.spotSegments(['Il est ___. (7 h 30)', 'x', []], 'sept heures');
  assert.deepEqual(segs.filter((sg) => !sg.punct).map((sg) => sg.text), ['Il', 'est', 'sept heures']);
  for (const u of DATA.units.filter((x) => x.grammar && x.grammar.notSpot)) {
    for (let seed = 1; seed < 200; seed++) {
      for (const sp of Core.buildLesson(DATA, u.id, Core.mulberry32(seed)).filter((e) => e.type === 'spot')) {
        assert.ok(!(u.grammar.notSpot[sp.drill] || []).includes(sp.wrong), `${u.id} drill ${sp.drill}: ${sp.wrong}`);
      }
    }
  }
});

// ---------------------------------------------------------------- chunks
test('chunkSentence keeps groups together and fixed expressions whole', () => {
  assert.deepEqual(Core.chunkSentence("Je voudrais un café, s'il vous plaît."), ['Je voudrais', 'un café,', "s'il vous plaît."]);
  assert.deepEqual(Core.chunkSentence('Il y a sept jours dans une semaine.'), ['Il y a', 'sept jours', 'dans une semaine.']);
  assert.deepEqual(Core.chunkSentence('Le bus passe à huit heures et quart.'), ['Le bus', 'passe', 'à huit heures et quart.']);
  assert.deepEqual(Core.chunkSentence('Elle a vingt et un ans.'), ['Elle', 'a', 'vingt et un ans.']);
  assert.equal(Core.chunkSentence('Merci beaucoup !'), null, 'under 3 words');
  assert.equal(Core.chunkSentence('Le chat dort.'), null, "can't cut 'Le | chat'");
  assert.deepEqual(Core.chunkSentence('Je ne parle pas espagnol.'), ['Je', 'ne parle pas', 'espagnol.']);
  assert.deepEqual(Core.chunkSentence('Jeudi soir, c\'est possible.'), ['Jeudi soir,', "c'est", 'possible.']);
  assert.deepEqual(Core.chunkSentence('Je m\'appelle Lucas Martin.'), ['Je', "m'appelle", 'Lucas Martin.']);
  assert.equal(Core.chunkSentence('Oui, bien sûr.'), null);
  assert.equal(Core.chunkSentence('Au revoir et merci !'), null, 'no lone « et »');
});

test('chunkSentence: every course sentence gives 3–4 chunks that rebuild it, never ending on an article', () => {
  const ARTICLE_END = /(?:^|\s)(?:le|la|les|un|une|des|du|de|au|aux|à|mon|ma|mes|ton|ta|ses|son|sa|notre|votre)$/i;
  let n = 0;
  for (const u of DATA.units) {
    const sents = u.items.map((it) => it.ex.fr)
      .concat(u.grammar ? u.grammar.sections.flatMap((x) => x.examples || []).map((e) => e[0]) : [])
      .concat(u.dialogue ? u.dialogue.lines.map((l) => l[1]) : []);
    for (const s of sents) {
      const c = Core.chunkSentence(s);
      if (!c) continue;
      n++;
      assert.ok(c.length >= 3 && c.length <= 4, `${s} → ${c.length}`);
      assert.equal(c.join(' '), Core.tokenize(s).join(' '), s);
      for (const ch of c) assert.ok(!ARTICLE_END.test(ch), `${s}: chunk "${ch}" ends on a little word`);
    }
  }
  assert.ok(n > 100, `most sentences can be chunked (${n})`);
});

test('buildLesson: one chunks exercise per unit (if it has a sentence to cut), shuffled, from a different sentence', () => {
  const byId = new Map(Core.allItems(DATA).map((it) => [it.id, it]));
  let units = 0;
  for (const u of DATA.units) {
    for (const seed of [1, 2, 3, 99]) {
      const ex = Core.buildLesson(DATA, u.id, Core.mulberry32(seed));
      const ch = ex.filter((e) => e.type === 'chunks');
      assert.ok(ch.length <= 1, `${u.id} seed ${seed}`);
      if (!ch.length) continue;
      if (seed === 1) units++;
      const c = ch[0];
      assert.deepEqual(c.chunks.slice().sort(), Core.chunkSentence(c.fr).slice().sort(), 'same chunks');
      assert.notEqual(c.chunks.join(' '), Core.chunkSentence(c.fr).join(' '), 'not already in order');
      assert.ok(c.en && c.audio, 'english and audio');
      const order = ex[ex.length - 1], dict = ex.find((e) => e.type === 'dictation');
      assert.notEqual(c.fr, byId.get(order.item).ex.fr);
      assert.notEqual(c.fr, byId.get(dict.item).ex.fr);
      assert.equal(ex[ex.length - 2].type, 'chunks', 'chunks just before the word-by-word sentence');
    }
  }
  assert.ok(units >= 22, `most units have one (${units})`);
});
