/* Pure app logic: state, XP, streaks, spaced repetition, exercises, achievements.
   No DOM access, so it can be unit-tested with Node (module.exports) and used in the browser (window.Core). */
(function (root) {
  const STORAGE_KEY = 'fr-learn-state-v1';
  const XP = { lessonBase: 10, perCorrect: 1, perfectBonus: 5, reviewBase: 5 };
  // Leitner boxes 1..5 → days until next review after a correct answer.
  const INTERVALS = [0, 1, 2, 4, 8, 16];
  const MAX_BOX = 5;
  const LEVELS = [
    [0, 'Débutant'], [50, 'Curieux'], [150, 'Apprenti'], [300, 'Voyageur'], [500, 'Bavard'],
    [800, 'Flâneur'], [1200, 'Gourmet'], [1700, 'Connaisseur'], [2300, 'Parisien'], [3000, 'Maître'],
  ];
  const GOALS = [
    { xp: 10, label: 'Détente', en: 'Casual' },
    { xp: 20, label: 'Régulier', en: 'Regular' },
    { xp: 30, label: 'Sérieux', en: 'Serious' },
    { xp: 50, label: 'Intense', en: 'Intense' },
  ];

  // ---------- dates (local calendar days as YYYY-MM-DD) ----------
  const pad = (n) => String(n).padStart(2, '0');
  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
  }
  function addDays(key, n) {
    const d = parseDay(key);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }
  function diffDays(a, b) { // b - a in days
    return Math.round((parseDay(b) - parseDay(a)) / 86400000);
  }

  // ---------- state ----------
  function defaultState() {
    return {
      version: 1,
      createdAt: dayKey(),
      settings: { name: '', dailyGoal: 20, autoplay: true, sfx: true, slowAudio: false, unlockAll: false, theme: 'auto' },
      xp: 0,
      daily: {},          // day -> { xp, lessons, reviews }
      streak: { current: 0, best: 0, lastDay: null },
      units: {},          // unitId -> { completed, bestScore, stars, plays }
      words: {},          // itemId -> { box, due, seen, correct, wrong }
      stats: { lessons: 0, reviews: 0, perfect: 0, listenCorrect: 0, typedCorrect: 0, totalCorrect: 0, totalAnswered: 0, goalsHit: 0, earlyBird: 0, nightOwl: 0 },
      achievements: {},   // id -> day unlocked
      milestones: {},     // id -> day reached
    };
  }
  // Rebuilds a state from stored or imported JSON, keeping only well-typed values.
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const day = (v, d = null) => (typeof v === 'string' && DAY_RE.test(v) ? v : d);
  function migrate(raw) {
    const s = defaultState();
    if (!isObj(raw)) return s;
    const rs = isObj(raw.settings) ? raw.settings : {};
    s.settings.name = typeof rs.name === 'string' ? rs.name.slice(0, 24) : '';
    s.settings.dailyGoal = GOALS.some((g) => g.xp === rs.dailyGoal) ? rs.dailyGoal : s.settings.dailyGoal;
    for (const k of ['autoplay', 'sfx', 'slowAudio', 'unlockAll']) if (typeof rs[k] === 'boolean') s.settings[k] = rs[k];
    if (['auto', 'light', 'dark'].includes(rs.theme)) s.settings.theme = rs.theme;
    s.createdAt = day(raw.createdAt, s.createdAt);
    s.xp = num(raw.xp);
    if (isObj(raw.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k]);
    if (isObj(raw.streak)) {
      s.streak = { current: num(raw.streak.current), best: num(raw.streak.best), lastDay: day(raw.streak.lastDay) };
    }
    if (isObj(raw.daily)) for (const [k, v] of Object.entries(raw.daily)) {
      if (day(k) && isObj(v)) s.daily[k] = { xp: num(v.xp), lessons: num(v.lessons), reviews: num(v.reviews) };
    }
    if (isObj(raw.units)) for (const [k, v] of Object.entries(raw.units)) {
      if (isObj(v)) s.units[k] = { completed: v.completed === true, bestScore: Math.min(1, num(v.bestScore)), stars: Math.min(3, num(v.stars)), plays: num(v.plays) };
    }
    if (isObj(raw.words)) for (const [k, v] of Object.entries(raw.words)) {
      if (isObj(v) && day(v.due)) {
        s.words[k] = { box: Math.min(MAX_BOX, Math.max(1, Math.round(num(v.box, 1)))), due: v.due, seen: num(v.seen), correct: num(v.correct), wrong: num(v.wrong) };
      }
    }
    for (const k of ['achievements', 'milestones']) {
      if (isObj(raw[k])) for (const [id, d] of Object.entries(raw[k])) if (day(d)) s[k][id] = d;
    }
    return s;
  }

  // ---------- XP, levels, streaks ----------
  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    const [floor, name] = LEVELS[i];
    const next = LEVELS[i + 1] ? LEVELS[i + 1][0] : null;
    return { level: i + 1, name, floor, next, progress: next ? (xp - floor) / (next - floor) : 1 };
  }
  function todayXp(state, today = dayKey()) {
    return (state.daily[today] && state.daily[today].xp) || 0;
  }
  // Streak as it should be displayed today: broken if the last active day is before yesterday.
  function currentStreak(state, today = dayKey()) {
    const last = state.streak.lastDay;
    if (!last) return 0;
    const gap = diffDays(last, today);
    return gap >= 0 && gap <= 1 ? state.streak.current : 0;
  }
  // Adds XP for an activity and updates daily log, streak and goal stats. Returns { goalReachedNow }.
  function recordActivity(state, { xp, kind }, now = new Date()) {
    const today = dayKey(now);
    const day = state.daily[today] || (state.daily[today] = { xp: 0, lessons: 0, reviews: 0 });
    const before = day.xp;
    day.xp += xp;
    if (kind === 'lesson') day.lessons++;
    if (kind === 'review') day.reviews++;
    state.xp += xp;

    const last = state.streak.lastDay;
    if (last !== today) {
      state.streak.current = last && diffDays(last, today) === 1 ? state.streak.current + 1 : 1;
      state.streak.lastDay = today;
    }
    state.streak.best = Math.max(state.streak.best, state.streak.current);

    const h = now.getHours();
    if (h < 8) state.stats.earlyBird++;
    if (h >= 22) state.stats.nightOwl++;

    const goal = state.settings.dailyGoal;
    const goalReachedNow = before < goal && day.xp >= goal;
    if (goalReachedNow) state.stats.goalsHit++;
    return { goalReachedNow };
  }

  // ---------- spaced repetition ----------
  function ensureWord(state, id, today) {
    return state.words[id] || (state.words[id] = { box: 1, due: addDays(today, INTERVALS[1]), seen: 0, correct: 0, wrong: 0 });
  }
  function reviewAnswer(state, id, correct, today = dayKey()) {
    const w = ensureWord(state, id, today);
    w.seen++;
    if (correct) {
      w.correct++;
      w.box = Math.min(w.box + 1, MAX_BOX);
    } else {
      w.wrong++;
      w.box = 1;
    }
    w.due = addDays(today, INTERVALS[w.box]);
    return w;
  }
  function dueWords(state, today = dayKey()) {
    return Object.entries(state.words)
      .filter(([, w]) => w.due <= today)
      .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].box - b[1].box))
      .map(([id]) => id);
  }
  // Words to practise when nothing is due: lowest box first, then most mistakes.
  function weakestWords(state, n = 10) {
    return Object.entries(state.words)
      .sort((a, b) => a[1].box - b[1].box || b[1].wrong - a[1].wrong)
      .slice(0, n)
      .map(([id]) => id);
  }
  function masteredCount(state) {
    return Object.values(state.words).filter((w) => w.box >= 4).length;
  }

  // ---------- answer checking ----------
  const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[’`´]/g, "'")
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[.,!?;:«»"¡¿]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Longer articles first; a space is required so "lapin" never loses its "la".
  const ARTICLE = /^(?:les|le|la|une|un|des) +|^l'\s*/;
  // Returns 'exact' | 'accent' (right except accents) | 'article' (right except the article) | 'wrong'.
  function checkAnswer(input, target) {
    const a = normalize(input), b = normalize(target);
    if (!a) return 'wrong';
    if (a === b) return 'exact';
    if (stripAccents(a) === stripAccents(b)) return 'accent';
    const a2 = stripAccents(a.replace(ARTICLE, '')), b2 = stripAccents(b.replace(ARTICLE, ''));
    if (a2 && a2 === b2) return 'article';
    return 'wrong';
  }
  // Splits a sentence into tiles for the word-order exercise; standalone punctuation sticks to the previous word.
  function tokenize(sentence) {
    const out = [];
    for (const t of sentence.split(/\s+/).filter(Boolean)) {
      if (/^[!?;:»]+$/.test(t) && out.length) out[out.length - 1] += ' ' + t;
      else out.push(t);
    }
    return out;
  }

  // ---------- exercises ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function allItems(data) {
    return data.units.flatMap((u) => u.items.map((it) => Object.assign({ unit: u.id }, it)));
  }
  function findItem(data, id) {
    for (const u of data.units) for (const it of u.items) if (it.id === id) return Object.assign({ unit: u.id }, it);
    return null;
  }
  // Up to n-1 distractors, preferring the same unit, never sharing the answer's text.
  function options(item, pool, field, rng, n = 4) {
    const same = shuffle(pool.filter((p) => p.unit === item.unit && p.id !== item.id), rng);
    const other = shuffle(pool.filter((p) => p.unit !== item.unit), rng);
    const seen = new Set([item[field]]);
    const picks = [];
    for (const p of same.concat(other)) {
      if (picks.length >= n - 1) break;
      if (seen.has(p[field])) continue;
      seen.add(p[field]);
      picks.push(p);
    }
    return shuffle([item].concat(picks), rng).map((p) => ({ id: p.id, text: p[field] }));
  }
  const SINGLE_TYPES = ['mc-en-fr', 'mc-fr-en', 'listen', 'type'];
  function singleExercise(type, item, pool, rng) {
    if (type === 'mc-en-fr' || type === 'listen') return { type, item: item.id, options: options(item, pool, 'fr', rng) };
    if (type === 'mc-fr-en') return { type, item: item.id, options: options(item, pool, 'en', rng) };
    return { type: 'type', item: item.id };
  }
  function buildLesson(data, unitId, rng = Math.random) {
    const unit = data.units.find((u) => u.id === unitId);
    const pool = allItems(data);
    const items = shuffle(unit.items.map((it) => Object.assign({ unit: unit.id }, it)), rng);
    // Easier recognition first, typing last; each word appears once.
    const order = ['mc-fr-en', 'mc-en-fr', 'listen', 'mc-fr-en', 'mc-en-fr', 'listen', 'type', 'type', 'listen', 'type'];
    const singles = items.map((it, i) => singleExercise(order[i % order.length], it, pool, rng));
    const match = { type: 'match', pairs: shuffle(items, rng).slice(0, 4).map((it) => it.id) };
    const orderItem = items[Math.floor(rng() * items.length)];
    const sentence = { type: 'order', item: orderItem.id, tiles: shuffle(tokenize(orderItem.ex.fr), rng) };
    // Put the match game in the middle and the sentence builder at the end.
    const mid = Math.floor(singles.length / 2);
    return singles.slice(0, mid).concat([match], singles.slice(mid), [sentence]);
  }
  function buildReview(data, ids, rng = Math.random) {
    const pool = allItems(data);
    return shuffle(ids, rng).map((id) => {
      const item = pool.find((p) => p.id === id);
      return item ? singleExercise(SINGLE_TYPES[Math.floor(rng() * SINGLE_TYPES.length)], item, pool, rng) : null;
    }).filter(Boolean);
  }

  // ---------- units & milestones ----------
  function completedUnits(state, data) {
    return data.units.filter((u) => state.units[u.id] && state.units[u.id].completed).length;
  }
  function unitUnlocked(state, data, index) {
    if (index === 0 || state.settings.unlockAll) return true;
    const prev = data.units[index - 1];
    return !!(state.units[prev.id] && state.units[prev.id].completed);
  }
  function starsFor(score) {
    return score >= 1 ? 3 : score >= 0.8 ? 2 : 1;
  }

  // ---------- achievements ----------
  const ACHIEVEMENTS = [
    { id: 'first-lesson', icon: '🌱', title: 'Premier pas', desc: 'Finish your first lesson', test: (s) => s.stats.lessons >= 1 },
    { id: 'perfect', icon: '💎', title: 'Sans faute', desc: 'Finish a lesson with no mistakes', test: (s) => s.stats.perfect >= 1 },
    { id: 'perfect-5', icon: '👑', title: 'Perfectionniste', desc: '5 perfect lessons', test: (s) => s.stats.perfect >= 5 },
    { id: 'streak-3', icon: '🔥', title: 'Ça chauffe', desc: 'Reach a 3-day streak', test: (s) => s.streak.best >= 3 },
    { id: 'streak-7', icon: '📆', title: 'Une semaine', desc: 'Reach a 7-day streak', test: (s) => s.streak.best >= 7 },
    { id: 'streak-14', icon: '🚀', title: 'Quinze jours', desc: 'Reach a 14-day streak', test: (s) => s.streak.best >= 14 },
    { id: 'streak-30', icon: '🏆', title: 'Un mois entier', desc: 'Reach a 30-day streak', test: (s) => s.streak.best >= 30 },
    { id: 'streak-100', icon: '🗼', title: 'Centenaire', desc: 'Reach a 100-day streak', test: (s) => s.streak.best >= 100 },
    { id: 'goal-1', icon: '🎯', title: 'Objectif atteint', desc: 'Hit your daily goal', test: (s) => s.stats.goalsHit >= 1 },
    { id: 'goal-10', icon: '🏹', title: 'Tireur d\'élite', desc: 'Hit your daily goal 10 times', test: (s) => s.stats.goalsHit >= 10 },
    { id: 'words-25', icon: '📗', title: 'Vocabulaire', desc: 'Learn 25 words', test: (s) => Object.keys(s.words).length >= 25 },
    { id: 'words-50', icon: '📘', title: 'Dictionnaire de poche', desc: 'Learn 50 words', test: (s) => Object.keys(s.words).length >= 50 },
    { id: 'words-all', icon: '📚', title: 'Encyclopédie', desc: 'Learn every word in the course', test: (s, d) => Object.keys(s.words).length >= allItems(d).length },
    { id: 'mastered-25', icon: '🧠', title: 'Mémoire d\'éléphant', desc: 'Master 25 words (box 4+) through review', test: (s) => masteredCount(s) >= 25 },
    { id: 'review-1', icon: '🔁', title: 'Révision', desc: 'Complete a daily review', test: (s) => s.stats.reviews >= 1 },
    { id: 'review-10', icon: '♻️', title: 'Assidu', desc: 'Complete 10 reviews', test: (s) => s.stats.reviews >= 10 },
    { id: 'listen-25', icon: '🎧', title: 'Oreille fine', desc: 'Answer 25 listening exercises', test: (s) => s.stats.listenCorrect >= 25 },
    { id: 'typed-25', icon: '⌨️', title: 'Plume d\'or', desc: 'Type 25 correct answers', test: (s) => s.stats.typedCorrect >= 25 },
    { id: 'early', icon: '🌅', title: 'Lève-tôt', desc: 'Study before 8 am', test: (s) => s.stats.earlyBird >= 1 },
    { id: 'night', icon: '🦉', title: 'Oiseau de nuit', desc: 'Study after 10 pm', test: (s) => s.stats.nightOwl >= 1 },
    { id: 'xp-500', icon: '⭐', title: 'Étoile montante', desc: 'Earn 500 XP', test: (s) => s.xp >= 500 },
    { id: 'xp-1500', icon: '🌟', title: 'Superstar', desc: 'Earn 1,500 XP', test: (s) => s.xp >= 1500 },
    { id: 'all-units', icon: '🇫🇷', title: 'Diplômé', desc: 'Complete every unit', test: (s, d) => completedUnits(s, d) >= d.units.length },
  ];
  // Unlocks newly earned achievements and milestones; returns them so the UI can celebrate.
  function evaluateProgress(state, data, now = new Date()) {
    const today = dayKey(now);
    const achievements = [];
    for (const a of ACHIEVEMENTS) {
      if (!state.achievements[a.id] && a.test(state, data)) {
        state.achievements[a.id] = today;
        achievements.push(a);
      }
    }
    const milestones = [];
    const done = completedUnits(state, data);
    for (const m of data.milestones) {
      if (!state.milestones[m.id] && done >= m.after) {
        state.milestones[m.id] = today;
        milestones.push(m);
      }
    }
    return { achievements, milestones };
  }

  // ---------- session completion ----------
  // results: [{ item, type, correct }] — first attempt of each exercise (match/order count as one).
  function completeLesson(state, data, unitId, results, now = new Date()) {
    const today = dayKey(now);
    const unit = data.units.find((u) => u.id === unitId);
    const correct = results.filter((r) => r.correct).length;
    const score = results.length ? correct / results.length : 0;
    const perfect = results.length > 0 && correct === results.length;
    const xp = XP.lessonBase + correct * XP.perCorrect + (perfect ? XP.perfectBonus : 0);

    for (const it of unit.items) {
      if (!state.words[it.id]) ensureWord(state, it.id, today);
    }
    tallyAnswers(state, results);
    const u = state.units[unitId] || (state.units[unitId] = { completed: false, bestScore: 0, stars: 0, plays: 0 });
    const wasCompleted = u.completed;
    u.completed = true;
    u.plays++;
    u.bestScore = Math.max(u.bestScore, score);
    u.stars = Math.max(u.stars, starsFor(score));
    state.stats.lessons++;
    if (perfect) state.stats.perfect++;

    const { goalReachedNow } = recordActivity(state, { xp, kind: 'lesson' }, now);
    const unlocked = evaluateProgress(state, data, now);
    return { xp, correct, total: results.length, score, perfect, stars: starsFor(score), firstCompletion: !wasCompleted, goalReachedNow, ...unlocked };
  }
  function completeReview(state, data, results, now = new Date()) {
    const today = dayKey(now);
    for (const r of results) reviewAnswer(state, r.item, r.correct, today);
    tallyAnswers(state, results);
    const correct = results.filter((r) => r.correct).length;
    const xp = XP.reviewBase + correct * XP.perCorrect;
    state.stats.reviews++;
    const { goalReachedNow } = recordActivity(state, { xp, kind: 'review' }, now);
    const unlocked = evaluateProgress(state, data, now);
    return { xp, correct, total: results.length, score: results.length ? correct / results.length : 0, goalReachedNow, ...unlocked };
  }
  function tallyAnswers(state, results) {
    for (const r of results) {
      state.stats.totalAnswered++;
      if (!r.correct) continue;
      state.stats.totalCorrect++;
      if (r.type === 'listen') state.stats.listenCorrect++;
      if (r.type === 'type') state.stats.typedCorrect++;
    }
  }

  const Core = {
    STORAGE_KEY, XP, INTERVALS, LEVELS, GOALS, ACHIEVEMENTS,
    dayKey, addDays, diffDays, defaultState, migrate,
    levelFor, todayXp, currentStreak, recordActivity,
    reviewAnswer, dueWords, weakestWords, masteredCount,
    normalize, checkAnswer, tokenize,
    mulberry32, shuffle, allItems, findItem, buildLesson, buildReview,
    completedUnits, unitUnlocked, starsFor, evaluateProgress, completeLesson, completeReview,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(this);
