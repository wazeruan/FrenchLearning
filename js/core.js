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
  // How 'type' exercises are shown: tap letter tiles, keyboard with hints, or replaced by multiple choice.
  const TYPING_MODES = ['tiles', 'keyboard', 'off'];
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
      settings: { name: '', dailyGoal: 20, autoplay: true, sfx: true, slowAudio: false, unlockAll: false, theme: 'auto', typing: 'tiles', speaking: true },
      xp: 0,
      daily: {},          // day -> { xp, lessons, reviews }
      streak: { current: 0, best: 0, lastDay: null },
      units: {},          // unitId -> { completed, bestScore, stars, plays }
      words: {},          // itemId -> { box, due, seen, correct, wrong }
      stats: { lessons: 0, reviews: 0, perfect: 0, listenCorrect: 0, typedCorrect: 0, totalCorrect: 0, totalAnswered: 0, goalsHit: 0, earlyBird: 0, nightOwl: 0, spokenGood: 0 },
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
    for (const k of ['autoplay', 'sfx', 'slowAudio', 'unlockAll', 'speaking']) if (typeof rs[k] === 'boolean') s.settings[k] = rs[k];
    if (['auto', 'light', 'dark'].includes(rs.theme)) s.settings.theme = rs.theme;
    if (TYPING_MODES.includes(rs.typing)) s.settings.typing = rs.typing;
    s.createdAt = day(raw.createdAt, s.createdAt);
    s.xp = num(raw.xp);
    if (isObj(raw.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k]);
    if (isObj(raw.streak)) {
      s.streak = { current: num(raw.streak.current), best: num(raw.streak.best), lastDay: day(raw.streak.lastDay) };
    }
    if (isObj(raw.daily)) for (const [k, v] of Object.entries(raw.daily)) {
      if (day(k) && isObj(v)) s.daily[k] = { xp: num(v.xp), lessons: num(v.lessons), reviews: num(v.reviews), minutes: num(v.minutes), listening: num(v.listening) };
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
  // minutes: time spent on the activity (capped so a forgotten open tab doesn't count as study).
  function recordActivity(state, { xp, kind, minutes = 0 }, now = new Date()) {
    const today = dayKey(now);
    const day = state.daily[today] || (state.daily[today] = { xp: 0, lessons: 0, reviews: 0, minutes: 0, listening: 0 });
    const before = day.xp;
    day.xp += xp;
    day.minutes = (day.minutes || 0) + Math.max(0, Math.min(45, minutes));
    if (kind === 'lesson') day.lessons++;
    if (kind === 'review') day.reviews++;
    if (kind === 'listening') day.listening = (day.listening || 0) + 1;
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
  // Spelling guide for a word: letters to fill in, with spaces and punctuation given for free.
  function letterSlots(word) {
    return Array.from(word).map((ch) => ({ ch, given: !/\p{L}/u.test(ch) }));
  }
  // Scrambled letters for the tile-spelling exercise (never in the original order when avoidable).
  function spellingTiles(word, rng = Math.random) {
    const letters = letterSlots(word).filter((s) => !s.given).map((s) => s.ch);
    const out = shuffle(letters, rng);
    if (out.join('') === letters.join('')) {
      // Still in order: swap the first pair of neighbouring letters that differ.
      const i = out.findIndex((ch, k) => k + 1 < out.length && ch !== out[k + 1]);
      if (i !== -1) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
    return out;
  }
  // Fills the first n letters of a word, keeping the given characters in place.
  function revealPrefix(word, n) {
    let seen = 0, out = '';
    for (const s of letterSlots(word)) {
      if (!s.given) { if (seen >= n) break; seen++; }
      out += s.ch;
    }
    return out;
  }
  // ---------- pronunciation ----------
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // Rough French sound-spelling: words that sound alike map to similar strings
  // (vert / verre / vers, et / est, pain / pin). Applied the same way to both sides.
  const V = '[aeiouyéèêëàâîïôûùœ]';
  const PHONETIC_RULES = [
    // Silent endings first, on the written word (before letters are turned into sounds):
    // -er/-ez/-et sound like é; then drop silent final consonants, then a final e.
    // (grandes → grande → "grand"; grand → "gran"; commencer keeps its c-sound.)
    [/(er|ez|et)$/, 'é'], [/(?<=.)[sxtdpz]+$/, ''], [/(?<=[^aeiouyéèêëgc])e$/, ''], // keep -ge/-ce: the e keeps g and c soft (neige, France)
    [/œu|oeu|eu/g, 'E'], [/eau|au/g, 'o'], [/ou|où|oû/g, 'U'], [/oi|oî/g, 'wa'],
    [new RegExp(`(ai|ei)n(?!${V}|n|m)`, 'g'), 'I'], [/ai|aî|ei|é|è|ê|ë/g, 'e'],
    [/qu/g, 'k'], [/c(?=[eiyéèê])/g, 's'], [/ç/g, 's'], [/ch/g, 'S'], [/c|k/g, 'k'], [/ph/g, 'f'], [/gn/g, 'N'],
    [/g(?=[eiyéèê])/g, 'j'], [/h/g, ''], [/ill/g, 'y'], [/y/g, 'i'],
    [new RegExp(`(an|am|en|em)(?!${V}|n|m)`, 'g'), 'A'], [new RegExp(`(in|im|un|um)(?!${V}|n|m)`, 'g'), 'I'],
    [new RegExp(`(on|om)(?!${V}|n|m)`, 'g'), 'O'],
    [/[àâ]/g, 'a'], [/[îï]/g, 'i'], [/[ôö]/g, 'o'], [/[ûü]/g, 'u'],
    [/([bcdfgjklmnpqrstvwxz])\1/g, '$1'],
  ];
  // Words whose final consonant is pronounced, which the silent-ending rule would otherwise drop.
  const SOUND_EXCEPTIONS = { sept: 'set', huit: 'Uit', six: 'sis', dix: 'dis', cinq: 'sIk', fils: 'fis', neuf: 'nEf', os: 'os', bus: 'bus' };
  const soundWord = (w) => SOUND_EXCEPTIONS[w] || PHONETIC_RULES.reduce((acc, [re, rep]) => acc.replace(re, rep), w);
  const words = (text) => normalize(text).replace(/oe/g, 'œ').split(/[\s'-]+/).filter(Boolean);
  function frenchSound(text) {
    return words(text).map(soundWord).join('');
  }
  // 0..1 similarity between what the recognizer heard and the target, by spelling and by sound.
  function pronunciationScore(heard, target) {
    // Compare the words without their articles, so "le chien" gets no credit for "le" against "le chat".
    // Dropping the article is fine for pronunciation, with a small deduction.
    const bare = (t) => normalize(t).replace(ARTICLE, '');
    const tBare = bare(target), hBare = bare(heard);
    const hasArticle = tBare !== normalize(target);
    const penalty = hasArticle && hBare === normalize(heard) ? 0.92 : 1;
    const keys = [(ws) => stripAccents(ws.join('')), (ws) => ws.map(soundWord).join('')]; // by spelling, by sound
    const tWords = words(tBare), hWords = words(hBare);
    if (!tWords.length || !hWords.length) return 0;
    const sim = (a, b) => (a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);
    let best = 0;
    for (const key of keys) {
      const t = key(tWords), hAll = key(hWords);
      best = Math.max(best, sim(t, hAll));
      // The target said inside a longer phrase: match whole spoken words, deducting for the extra speech.
      for (let i = 0; i < hWords.length; i++) {
        for (let j = i + 1; j <= Math.min(hWords.length, i + tWords.length + 1); j++) {
          if (j - i === hWords.length) continue;
          best = Math.max(best, sim(t, key(hWords.slice(i, j))) * (0.6 + 0.3 * Math.min(1, t.length / hAll.length)));
        }
      }
    }
    return Math.max(0, Math.min(1, best * penalty));
  }
  function pronunciationLevel(score) {
    return score >= 0.9 ? 'great' : score >= 0.6 ? 'close' : 'retry';
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
    const lesson = singles.slice(0, mid).concat([match], singles.slice(mid));
    if (!unit.grammar) return lesson.concat([sentence]);
    // Grammar units: 6 fill-in-the-blank drills, spread through the second half.
    const drills = shuffle(unit.grammar.drills.map((d, i) => i), rng).slice(0, 6).map((i) => ({
      type: 'fill', unit: unit.id, drill: i, options: shuffle(unit.grammar.drills[i][2], rng),
    }));
    const out = lesson.slice(0, mid + 1);
    const rest = lesson.slice(mid + 1);
    drills.forEach((d, k) => { out.push(d); if (rest[k]) out.push(rest[k]); });
    return out.concat(rest.slice(drills.length), [sentence]);
  }
  // The sentence a learner hears for a drill: blank filled in, hints in brackets removed.
  function drillSpeech([sentence, answer]) {
    if (/^\d+ = ___$/.test(sentence)) return answer; // "17 = ___" → "dix-sept"
    return sentence.replace('___', answer).replace(/\s*\([^)]*\)/g, '').replace(/' /g, "'").trim();
  }
  // Turns a typing exercise into a multiple-choice one (used when typing is switched off).
  function asChoice(data, ex, rng = Math.random) {
    const item = findItem(data, ex.item);
    return Object.assign(singleExercise('mc-en-fr', item, allItems(data), rng), { retry: ex.retry });
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
    const done = (u) => !!(state.units[u.id] && state.units[u.id].completed);
    return done(data.units[index]) || done(data.units[index - 1]);
  }
  // Units completed / total within a stage.
  function stageProgress(state, data, stageId) {
    const units = data.units.filter((u) => u.stage === stageId);
    return { done: units.filter((u) => state.units[u.id] && state.units[u.id].completed).length, total: units.length };
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
    { id: 'typed-25', icon: '⌨️', title: 'Plume d\'or', desc: 'Spell 25 words correctly', test: (s) => s.stats.typedCorrect >= 25 },
    { id: 'speak-10', icon: '🎤', title: 'Bien dit !', desc: 'Pronounce 10 words well', test: (s) => s.stats.spokenGood >= 10 },
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
  function completeLesson(state, data, unitId, results, now = new Date(), minutes = 0) {
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

    const { goalReachedNow } = recordActivity(state, { xp, kind: 'lesson', minutes }, now);
    const unlocked = evaluateProgress(state, data, now);
    return { xp, correct, total: results.length, score, perfect, stars: starsFor(score), firstCompletion: !wasCompleted, goalReachedNow, ...unlocked };
  }
  function completeReview(state, data, results, now = new Date(), minutes = 0) {
    const today = dayKey(now);
    for (const r of results) reviewAnswer(state, r.item, r.correct, today);
    tallyAnswers(state, results);
    const correct = results.filter((r) => r.correct).length;
    const xp = XP.reviewBase + correct * XP.perCorrect;
    state.stats.reviews++;
    const { goalReachedNow } = recordActivity(state, { xp, kind: 'review', minutes }, now);
    const unlocked = evaluateProgress(state, data, now);
    return { xp, correct, total: results.length, score: results.length ? correct / results.length : 0, goalReachedNow, ...unlocked };
  }
  // Dialogue comprehension questions: listening practice, 1 XP per correct answer + 2 for finishing.
  function completeListening(state, data, { correct, total }, now = new Date(), minutes = 0) {
    state.stats.listenCorrect += correct;
    state.stats.totalAnswered += total;
    state.stats.totalCorrect += correct;
    const xp = 2 + correct;
    const { goalReachedNow } = recordActivity(state, { xp, kind: 'listening', minutes }, now);
    const unlocked = evaluateProgress(state, data, now);
    return { xp, goalReachedNow, ...unlocked };
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
    STORAGE_KEY, XP, INTERVALS, LEVELS, GOALS, TYPING_MODES, ACHIEVEMENTS,
    dayKey, addDays, diffDays, defaultState, migrate,
    levelFor, todayXp, currentStreak, recordActivity,
    reviewAnswer, dueWords, weakestWords, masteredCount,
    normalize, checkAnswer, tokenize, frenchSound, pronunciationScore, pronunciationLevel, letterSlots, spellingTiles, revealPrefix, asChoice,
    mulberry32, shuffle, allItems, findItem, buildLesson, buildReview,
    completedUnits, unitUnlocked, stageProgress, starsFor, evaluateProgress, completeLesson, completeReview, completeListening, drillSpeech,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(this);
