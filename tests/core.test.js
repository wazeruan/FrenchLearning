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
  assert.deepEqual(s.daily['2026-10-01'], { xp: 10, lessons: 1, reviews: 1 });
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

test('buildLesson: structure for all 12 units and several seeds', () => {
  assert.equal(DATA.units.length, 12);
  const byId = new Map(Core.allItems(DATA).map((it) => [it.id, it]));
  for (const unit of DATA.units) {
    const ids = unit.items.map((it) => it.id);
    for (const seed of [1, 2, 3, 42, 1234, 99999, 0xdeadbeef]) {
      const ex = Core.buildLesson(DATA, unit.id, Core.mulberry32(seed));
      const tag = `${unit.id} seed ${seed}`;
      const singles = ex.filter((e) => SINGLE.has(e.type));
      assert.deepEqual(singles.map((e) => e.item).sort(), ids.slice().sort(), `${tag}: each item once`);
      assert.equal(ex.length, ids.length + 2, tag);

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
  r = Core.completeLesson(s, DATA, 'u02', allCorrect(DATA.units[1]), at(2026, 10, 2));
  assert.ok(ids(r).includes('perfect'));
  assert.ok(!ids(r).includes('first-lesson'), 'not returned again');
  assert.ok(!ids(r).includes('words-25'));
  assert.equal(r.milestones.length, 0);

  // Day 3: unit 3 -> streak-3, words-25 (28 words), milestone m1
  r = Core.completeLesson(s, DATA, 'u03', allCorrect(DATA.units[2]), at(2026, 10, 3));
  assert.ok(ids(r).includes('streak-3'));
  assert.ok(ids(r).includes('words-25'));
  assert.ok(!ids(r).includes('perfect'));
  assert.deepEqual(r.milestones.map((m) => m.id), ['m1']);
  assert.equal(s.milestones.m1, '2026-10-03');

  // Replay: nothing re-announced
  r = Core.evaluateProgress(s, DATA, at(2026, 10, 3, 14));
  assert.deepEqual(r, { achievements: [], milestones: [] });
});

test('milestone m1 not reached with 2 units, nor with replays of the same unit', () => {
  const s = fresh();
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1));
  const r = Core.completeLesson(s, DATA, 'u02', allCorrect(DATA.units[1]), at(2026, 10, 1));
  assert.equal(r.milestones.length, 0);
  assert.equal(s.milestones.m1, undefined);
  assert.equal(Core.completedUnits(s, DATA), 2);
});

test('early / night achievements', () => {
  const s = fresh();
  const r = Core.completeLesson(s, DATA, 'u01', allCorrect(DATA.units[0]), at(2026, 10, 1, 6));
  assert.ok(r.achievements.some((a) => a.id === 'early'));
  assert.ok(!r.achievements.some((a) => a.id === 'night'));
  const r2 = Core.completeLesson(s, DATA, 'u02', allCorrect(DATA.units[1]), at(2026, 10, 1, 23));
  assert.ok(r2.achievements.some((a) => a.id === 'night'));
});

test('all units complete -> all-units achievement and m4', () => {
  const s = fresh();
  let r;
  DATA.units.forEach((u, i) => { r = Core.completeLesson(s, DATA, u.id, allCorrect(u), at(2026, 10, 1 + i)); });
  assert.ok(r.achievements.some((a) => a.id === 'all-units'));
  assert.ok(r.milestones.some((m) => m.id === 'm4'));
  assert.ok(s.achievements['words-all']);
  assert.deepEqual(Object.keys(s.milestones).sort(), ['m1', 'm2', 'm3', 'm4']);
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
  assert.deepEqual(s.daily, { '2026-10-01': { xp: 10, lessons: 0, reviews: 1 } });
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
  const round = Core.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(round, s);
  assert.deepEqual(Core.migrate(round), s);
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
