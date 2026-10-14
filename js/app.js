/* UI: hash router, views, exercises, audio and celebrations. All logic that touches progress lives in core.js. */
(function () {
  'use strict';
  const D = window.FR_DATA;
  const C = window.Core;
  const view = document.getElementById('view');

  // ---------- persistence (this browser only) ----------
  let state = load();
  function load() {
    try { return C.migrate(JSON.parse(localStorage.getItem(C.STORAGE_KEY))); }
    catch (e) { return C.defaultState(); }
  }
  function save() {
    try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️', 'Could not save progress', 'Browser storage is unavailable.'); }
  }

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // French typography: keep « » ! ? : ; attached with a non-breaking space.
  const fr = (s) => esc(s).replace(/ ([!?:;»])/g, '&nbsp;$1').replace(/« /g, '«&nbsp;');
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const today = () => C.dayKey();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const unitById = (id) => D.units.find((u) => u.id === id);
  const PRAISE = ['Très bien !', 'Parfait !', 'Excellent !', 'Bravo !', 'Super !', 'Génial !', 'Magnifique !'];
  const ENCOURAGE = ['Pas grave !', 'Presque !', 'On continue !', 'Courage !'];
  const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ô', 'î', 'û', 'ù', 'ë', 'ï', 'œ'];

  function imgHtml(item, cls = '') {
    const img = item.img || {};
    if (img.swatch) return `<span class="pic swatch ${cls}" style="--sw:${img.swatch}" aria-hidden="true"></span>`;
    if (img.dots) {
      const n = img.dots, rows = Math.ceil(n / 5);
      let dots = '';
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / 5), c = i % 5, inRow = Math.min(5, n - r * 5);
        const x = (104 - inRow * 20) / 2 + 10 + c * 20, y = rows === 1 ? 30 : 20 + r * 20;
        dots += `<circle cx="${x}" cy="${y}" r="7"/>`;
      }
      return `<span class="pic dots ${cls}" aria-hidden="true"><svg viewBox="0 0 104 60">${dots}</svg></span>`;
    }
    return `<span class="pic emoji ${cls}" aria-hidden="true">${img.emoji || '❓'}</span>`;
  }
  const speakerBtn = (id, label = 'Play audio', extra = '') =>
    `<button class="speaker ${extra}" data-audio="${id}" aria-label="${label}" title="${label}">${ICON.speaker}</button>`;
  const ICON = {
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    turtle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c0-4 3.6-7 8-7s8 3 8 7H3zm16-2h2.5a1.5 1.5 0 0 0 0-3H19M6 15v3m10-3v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4zm0 2H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3m-5 3v4m-4 3h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  };
  const stars = (n, of = 3) => `<span class="stars" aria-label="${n} of ${of} stars">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`;

  // ---------- audio ----------
  const Sound = {
    current: null,
    play(id, text) {
      this.stop();
      const a = new Audio(`assets/audio/${id}.m4a`);
      a.playbackRate = state.settings.slowAudio ? 0.75 : 1;
      a.preservesPitch = true;
      this.current = a;
      this.start(a, text);
    },
    playSlow(id, text) {
      this.stop();
      const a = new Audio(`assets/audio/${id}.m4a`);
      a.playbackRate = 0.6;
      this.current = a;
      this.start(a, text, 0.6);
    },
    start(a, text, rate) { // falls back to the browser voice only if this clip is still the current one
      const fallback = () => { if (text && this.current === a) this.speak(text, rate); };
      a.addEventListener('error', fallback, { once: true });
      a.play().catch((err) => { if (err && err.name !== 'AbortError' && err.name !== 'NotAllowedError') fallback(); });
    },
    speak(text, rate) { // fallback: the browser's own French voice
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      u.rate = rate || (state.settings.slowAudio ? 0.75 : 0.95);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    },
    stop() {
      if (this.current) { this.current.pause(); this.current = null; }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
    ctx: null,
    sfx(kind) { // synthesized feedback tones, no files needed
      if (!state.settings.sfx) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.ctx, t0 = ctx.currentTime;
        const notes = { good: [[660, 0], [880, 0.09]], bad: [[220, 0], [185, 0.12]], win: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]], tap: [[520, 0]] }[kind];
        for (const [f, dt] of notes) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = kind === 'bad' ? 'triangle' : 'sine';
          o.frequency.value = f;
          const len = kind === 'tap' ? 0.06 : kind === 'win' ? 0.35 : 0.18;
          g.gain.setValueAtTime(0.0001, t0 + dt);
          g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.05 : 0.18, t0 + dt + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + len);
          o.connect(g).connect(ctx.destination);
          o.start(t0 + dt); o.stop(t0 + dt + len + 0.02);
        }
      } catch (e) { /* audio not available */ }
    },
  };
  function itemText(audioId) {
    const isEx = audioId.endsWith('-ex');
    const item = C.findItem(D, isEx ? audioId.slice(0, -3) : audioId);
    return item ? (isEx ? item.ex.fr : item.fr) : '';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-audio]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.audio;
    if (b.dataset.slow) Sound.playSlow(id, itemText(id)); else Sound.play(id, itemText(id));
    b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
  });

  // ---------- toasts & confetti ----------
  function toast(icon, title, sub = '') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-i">${icon}</span><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#1F3A68', '#E2554A', '#F2B544', '#4E9A6F', '#A9C7EA', '#ffffff'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: pick(colors),
    }));
    let frames = 0;
    (function tick() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        ctx.restore();
      }
      if (++frames < 150) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  // ---------- theme & chrome ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function renderChrome(tab) {
    const streak = C.currentStreak(state);
    const doneToday = C.todayXp(state) > 0;
    $('#chips').innerHTML = `
      <span class="chip streak ${doneToday ? 'lit' : ''}" title="Day streak">${ICON.flame}<b>${streak}</b></span>
      <span class="chip xp" title="Total XP">${ICON.star}<b>${state.xp}</b></span>`;
    const due = C.dueWords(state).length;
    const badge = $('#due-badge');
    badge.hidden = !due; badge.textContent = due > 99 ? '99+' : due;
    $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    document.body.classList.toggle('in-session', tab === 'session');
  }

  // ---------- router ----------
  let session = null; // active learn/practice session (in memory)
  function route() {
    Sound.stop();
    keyHandler = null;
    timers.forEach(clearTimeout); timers = [];
    session = null;
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    const routes = { '': home, unit: unitIntro, learn, practice: startPractice, review, progress, settings };
    const fn = routes[name] || home;
    try { fn(arg); }
    catch (err) {
      console.error(err);
      if (name !== 'settings') return go('#/settings');
      view.innerHTML = '<section class="card"><h3>Something went wrong</h3><p>Your saved progress may be damaged.</p><button class="btn danger" id="hard-reset">Reset progress</button></section>';
      $('#hard-reset').onclick = () => { state = C.defaultState(); save(); go('#/'); };
    }
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); route(); }
  });
  // Timers scheduled by a view are cancelled when the view changes.
  let timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  // ---------- home ----------
  function greeting() {
    const h = new Date().getHours();
    const hello = h < 18 ? 'Bonjour' : 'Bonsoir';
    return state.settings.name ? `${hello}, ${state.settings.name} !` : `${hello} !`;
  }
  function weekStrip() {
    const t = today();
    let out = '';
    for (let i = 6; i >= 0; i--) {
      const d = C.addDays(t, -i);
      const xp = (state.daily[d] && state.daily[d].xp) || 0;
      const dow = new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'narrow' });
      const cls = xp >= state.settings.dailyGoal ? 'goal' : xp > 0 ? 'some' : '';
      out += `<li class="${cls} ${i === 0 ? 'today' : ''}" title="${d}: ${xp} XP"><i>${cls === 'goal' ? ICON.check : ''}</i><span>${dow.toUpperCase()}</span></li>`;
    }
    return `<ol class="week">${out}</ol>`;
  }
  function ring(value, goal, size = 92) {
    const r = size / 2 - 7, c = 2 * Math.PI * r, p = Math.min(value / goal, 1);
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg ${p >= 1 ? 'done' : ''}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
  }
  function nextUnitIndex() {
    const i = D.units.findIndex((u) => !(state.units[u.id] && state.units[u.id].completed));
    return i === -1 ? D.units.length - 1 : i;
  }
  function home() {
    renderChrome('home');
    const xpToday = C.todayXp(state), goal = state.settings.dailyGoal;
    const streak = C.currentStreak(state);
    const due = C.dueWords(state).length;
    const next = D.units[nextUnitIndex()];
    const allDone = C.completedUnits(state, D) === D.units.length;
    let bubble;
    if (xpToday >= goal) bubble = `Objectif atteint ! You hit today's goal. À demain !`;
    else if (streak > 0 && xpToday === 0) bubble = `Keep your <b>${streak}-day</b> streak alive — one lesson is enough.`;
    else if (!state.stats.lessons) bubble = `I'm Coco. Let's learn your first French words together!`;
    else bubble = `${goal - xpToday} XP to go for today's goal. Allez !`;

    let path = '';
    D.units.forEach((u, i) => {
      const st = state.units[u.id] || {};
      const unlocked = C.unitUnlocked(state, D, i);
      const current = unlocked && !st.completed && i === nextUnitIndex();
      const cls = st.completed ? 'done' : current ? 'current' : unlocked ? 'open' : 'locked';
      path += `
        <li class="node ${cls}" style="--i:${i}">
          <a ${unlocked ? `href="#/unit/${u.id}"` : 'aria-disabled="true"'} class="node-link">
            <span class="node-art"><img src="assets/img/units/${u.cover}.svg" alt="" loading="lazy">${!unlocked ? `<span class="lock">${ICON.lock}</span>` : ''}</span>
            <span class="node-text">
              <small>Unit ${i + 1}</small>
              <b>${esc(u.title)}</b>
              <span>${esc(u.en)}</span>
              ${st.completed ? stars(st.stars) : current ? '<em class="start-tag">Start</em>' : ''}
            </span>
          </a>
        </li>`;
      const m = D.milestones.find((x) => x.after === i + 1);
      if (m) {
        const reached = !!state.milestones[m.id];
        const left = m.after - C.completedUnits(state, D);
        path += `<li class="milestone ${reached ? 'reached' : ''}">
          <span class="trophy">${ICON.trophy}</span>
          <div><b>${esc(m.title)}</b><small>${reached ? esc(m.en) : `Milestone · ${left} unit${left === 1 ? '' : 's'} to go`}</small></div>
        </li>`;
      }
    });

    view.innerHTML = `
      <section class="hero card">
        <div class="hero-top">
          <img class="mascot bob" src="assets/img/mascot.svg" alt="Coco the rooster">
          <div class="bubble"><b>${esc(greeting())}</b><p>${bubble}</p></div>
        </div>
        <div class="hero-stats">
          <div class="goal-ring">${ring(xpToday, goal)}<div class="ring-label"><b>${xpToday}</b><small>/ ${goal} XP</small></div></div>
          <div class="hero-side">
            <div class="streak-line">${ICON.flame}<b>${streak}</b> day streak <small>· best ${state.streak.best}</small></div>
            ${weekStrip()}
          </div>
        </div>
        <div class="hero-actions">
          ${allDone ? `<a class="btn primary" href="#/review">Practise your words</a>` : `<a class="btn primary" href="#/unit/${next.id}">${state.units[next.id] ? 'Continue' : 'Start'}: ${esc(next.title)}</a>`}
          ${due ? `<a class="btn ghost" href="#/review">🔁 Review ${due} word${due === 1 ? '' : 's'}</a>` : ''}
        </div>
      </section>
      <h2 class="section-title">Your path <small>${C.completedUnits(state, D)} / ${D.units.length} units</small></h2>
      <ol class="path">${path}</ol>`;
  }

  // ---------- unit intro ----------
  function unitIntro(id) {
    const u = unitById(id);
    if (!u) return go('#/');
    const i = D.units.indexOf(u);
    if (!C.unitUnlocked(state, D, i)) return go('#/');
    renderChrome('home');
    const st = state.units[u.id];
    view.innerHTML = `
      <a class="back" href="#/">← Back</a>
      <section class="card unit-intro">
        <img class="unit-cover" src="assets/img/units/${u.cover}.svg" alt="">
        <small class="eyebrow">Unit ${i + 1} · ${u.items.length} words</small>
        <h1>${esc(u.title)}</h1>
        <p class="sub">${esc(u.en)}</p>
        ${st ? `<p>${stars(st.stars)} <small class="muted">Best ${Math.round(st.bestScore * 100)}%</small></p>` : ''}
        <div class="tip"><b>💡 Le saviez-vous ?</b><p>${fr(u.tip)}</p></div>
        <ul class="word-chips">${u.items.map((it) => `<li><button data-audio="${it.id}">${imgHtml(it, 'xs')}<span lang="fr">${fr(it.fr)}</span></button></li>`).join('')}</ul>
        <div class="row">
          <a class="btn primary" href="#/learn/${u.id}">📖 Learn the words</a>
          <a class="btn ${st ? 'secondary' : 'ghost'}" href="#/practice/${u.id}">✏️ ${st ? 'Practise again' : 'Skip to practice'}</a>
        </div>
      </section>`;
  }

  // ---------- learn (flashcards) ----------
  function learn(id) {
    const u = unitById(id);
    if (!u || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    renderChrome('session');
    let i = 0;
    const draw = () => {
      const it = u.items[i];
      view.innerHTML = `
        <div class="session-head">
          <a class="icon-btn" href="#/unit/${u.id}" aria-label="Close">${ICON.close}</a>
          <div class="progress"><i style="width:${((i + 1) / u.items.length) * 100}%"></i></div>
          <span class="count">${i + 1}/${u.items.length}</span>
        </div>
        <article class="card flash" lang="fr">
          ${imgHtml(it, 'xl')}
          <h1 class="fr-word">${fr(it.fr)}</h1>
          <div class="audio-row">${speakerBtn(it.id, 'Play word', 'big')}<button class="speaker slow" data-audio="${it.id}" data-slow="1" aria-label="Play slowly" title="Play slowly">${ICON.turtle}</button></div>
          <p class="en" lang="en">${esc(it.en)}</p>
          ${it.note ? `<p class="note" lang="en">${esc(it.note)}</p>` : ''}
          <div class="example">
            ${speakerBtn(it.id + '-ex', 'Play example')}
            <div><p class="ex-fr">${fr(it.ex.fr)}</p><p class="ex-en" lang="en">${esc(it.ex.en)}</p></div>
          </div>
        </article>
        <div class="session-foot">
          <button class="btn secondary" id="prev" ${i === 0 ? 'disabled' : ''}>← Back</button>
          <button class="btn primary" id="next">${i === u.items.length - 1 ? 'Start practice →' : 'Next →'}</button>
        </div>`;
      $('#prev').onclick = () => { if (i > 0) { i--; draw(); } };
      $('#next').onclick = () => { if (i < u.items.length - 1) { i++; draw(); } else go(`#/practice/${u.id}`); };
      if (state.settings.autoplay) later(() => Sound.play(it.id, it.fr), 200);
    };
    keyHandler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') $('#next') && $('#next').click();
      else if (e.key === 'ArrowLeft') $('#prev') && $('#prev').click();
      else if (e.key === ' ') { e.preventDefault(); Sound.play(u.items[i].id, u.items[i].fr); }
    };
    draw();
  }

  // ---------- practice sessions ----------
  let keyHandler = null;
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=text], textarea') && e.key !== 'Enter') return;
    // Let focused links/buttons handle their own Enter/Space (except the main action buttons).
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('a, button, select, label') && !e.target.matches('#check, #continue, #next')) return;
    if (keyHandler) keyHandler(e);
  });

  function startPractice(id) {
    const u = unitById(id);
    if (!u || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    runSession({ kind: 'lesson', unit: u, queue: C.buildLesson(D, u.id) });
  }
  function review() {
    renderChrome('review');
    const due = C.dueWords(state);
    const learned = Object.keys(state.words).length;
    const mastered = C.masteredCount(state);
    let body;
    if (!learned) {
      body = `<p>Finish your first lesson and its words will appear here for review.</p><a class="btn primary" href="#/">Go to lessons</a>`;
    } else if (due.length) {
      body = `<p class="big-num">${due.length}</p><p>word${due.length === 1 ? '' : 's'} ready for review today.</p>
        <button class="btn primary" id="go-review">Start review${due.length > 12 ? ' (12)' : ''}</button>`;
    } else {
      const next = Object.values(state.words).map((w) => w.due).sort()[0];
      body = `<p class="big-num">✓</p><p>All caught up! Next review: <b>${next ? esc(new Date(next + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })) : '—'}</b>.</p>
        <button class="btn secondary" id="go-weak">Practise weakest words anyway</button>`;
    }
    const boxes = [1, 2, 3, 4, 5].map((b) => Object.values(state.words).filter((w) => w.box === b).length);
    const maxBox = Math.max(1, ...boxes);
    view.innerHTML = `
      <h1 class="page-title">Révision <small>Daily review</small></h1>
      <section class="card center review-hero">
        <img class="mascot small" src="assets/img/mascot.svg" alt="">
        ${body}
      </section>
      <section class="card">
        <h3>Memory boxes</h3>
        <p class="muted small">Words move up a box each time you remember them, and come back less often: tomorrow, then 2, 4, 8 and 16 days. A mistake sends a word back to box 1.</p>
        <div class="boxes">${boxes.map((n, i) => `<div class="box b${i + 1}"><div class="bar"><i style="height:${(n / maxBox) * 100}%"></i></div><b>${n}</b><small>Box ${i + 1}</small></div>`).join('')}</div>
        <p class="small">${learned} words learned · ${mastered} mastered</p>
      </section>`;
    const start = (ids) => runSession({ kind: 'review', queue: C.buildReview(D, ids) });
    if ($('#go-review')) $('#go-review').onclick = () => start(due.slice(0, 12));
    if ($('#go-weak')) $('#go-weak').onclick = () => start(C.weakestWords(state, 10));
  }

  function runSession({ kind, unit, queue }) {
    renderChrome('session');
    session = { kind, unit, queue: queue.slice(), total: queue.length, done: 0, results: [], retried: new Set(), started: Date.now() };
    nextExercise();
  }
  function closeHref() { return session.kind === 'lesson' ? `#/unit/${session.unit.id}` : '#/review'; }

  function nextExercise() {
    if (!session.queue.length) return finishSession();
    const ex = session.queue.shift();
    session.current = ex;
    const pct = (session.done / session.total) * 100;
    view.innerHTML = `
      <div class="session-head">
        <a class="icon-btn" href="${closeHref()}" aria-label="Quit">${ICON.close}</a>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <span class="count">${session.kind === 'review' ? '🔁' : '✏️'}</span>
      </div>
      ${ex.retry ? '<p class="retry-tag">Let\'s try that one again</p>' : ''}
      <section class="exercise" id="ex"></section>
      <div class="feedback" id="fb" role="status" aria-live="polite" hidden></div>
      <div class="session-foot" id="foot"><button class="btn primary wide" id="check" disabled>Check</button></div>`;
    const renderers = { 'mc-fr-en': exMC, 'mc-en-fr': exMC, listen: exMC, type: exType, match: exMatch, order: exOrder };
    renderers[ex.type](ex);
  }

  // Records the outcome, shows feedback and queues one retry for mistakes.
  function answered(ex, correct, info = {}) {
    if (!ex.retry) session.results.push({ item: ex.item || ex.pairs[0], type: ex.type, correct });
    if (!correct && !ex.retry && ex.type !== 'match') {
      session.queue.push(Object.assign({}, ex, { retry: true }));
      session.total++;
    }
    session.done++;
    $('.progress i').style.width = `${(session.done / session.total) * 100}%`;
    Sound.sfx(correct ? 'good' : 'bad');
    const item = ex.item ? C.findItem(D, ex.item) : null;
    const fb = $('#fb');
    const title = correct ? pick(PRAISE) : pick(ENCOURAGE);
    let detail = '';
    if (info.hint) detail += `<p class="hint">${info.hint}</p>`;
    if (item && ex.type === 'order') detail += `<div class="fb-answer">${speakerBtn(item.id + '-ex')}<div><b lang="fr">${fr(item.ex.fr)}</b><small>${esc(item.ex.en)}</small></div></div>`;
    else if (item) detail += `<div class="fb-answer">${speakerBtn(item.id)}<div><b lang="fr">${fr(item.fr)}</b><small>${esc(item.en)}</small></div></div>`;
    fb.className = `feedback ${correct ? 'good' : 'bad'}`;
    fb.innerHTML = `<h3>${correct ? ICON.check : '✗'} ${title}</h3>${correct || info.hint ? '' : '<p class="hint">Correct answer:</p>'}${detail}`;
    fb.hidden = false;
    $('#foot').innerHTML = `<button class="btn ${correct ? 'primary' : 'danger'} wide" id="continue">Continue</button>`;
    $('#continue').onclick = nextExercise;
    $('#continue').focus({ preventScroll: true });
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); nextExercise(); } };
    if (item && state.settings.autoplay) {
      later(() => (ex.type === 'order' ? Sound.play(item.id + '-ex', item.ex.fr) : Sound.play(item.id, item.fr)), 350);
    }
  }

  function exMC(ex) {
    const it = C.findItem(D, ex.item);
    const box = $('#ex');
    let prompt;
    if (ex.type === 'mc-fr-en') {
      prompt = `<p class="instr">What does this mean?</p>
        <div class="prompt-word" lang="fr">${speakerBtn(it.id)}<b>${fr(it.fr)}</b></div>`;
    } else if (ex.type === 'mc-en-fr') {
      prompt = `<p class="instr">How do you say this in French?</p>
        <div class="prompt-pic">${imgHtml(it, 'lg')}<b>${esc(it.en)}</b></div>`;
    } else {
      prompt = `<p class="instr">Listen and choose what you hear</p>
        <div class="listen-row">${speakerBtn(it.id, 'Play', 'huge')}<button class="speaker slow" data-audio="${it.id}" data-slow="1" aria-label="Play slowly">${ICON.turtle}</button></div>`;
    }
    const isFr = ex.type !== 'mc-fr-en';
    box.innerHTML = `${prompt}<div class="options">${ex.options.map((o, k) =>
      `<button class="option" data-id="${o.id}" ${isFr ? 'lang="fr"' : ''}><kbd>${k + 1}</kbd><span>${isFr ? fr(o.text) : esc(o.text)}</span></button>`).join('')}</div>`;
    let chosen = null;
    const choose = (btn) => {
      $$('.option', box).forEach((b) => { b.classList.toggle('selected', b === btn); b.setAttribute('aria-pressed', b === btn); });
      chosen = btn.dataset.id;
      $('#check').disabled = false;
      Sound.sfx('tap');
      if (isFr && ex.type !== 'listen' && state.settings.autoplay) Sound.play(chosen, itemText(chosen));
    };
    $$('.option', box).forEach((b) => (b.onclick = () => choose(b)));
    const check = () => {
      if (!chosen) return;
      const ok = chosen === it.id;
      $$('.option', box).forEach((b) => {
        b.disabled = true;
        if (b.dataset.id === it.id) b.classList.add('right');
        else if (b.dataset.id === chosen) b.classList.add('wrong');
      });
      answered(ex, ok);
    };
    $('#check').onclick = check;
    keyHandler = (e) => {
      const n = Number(e.key);
      const opts = $$('.option', box);
      if (n >= 1 && n <= opts.length && !opts[n - 1].disabled) choose(opts[n - 1]);
      else if (e.key === 'Enter' && chosen) { e.preventDefault(); check(); }
    };
    if (ex.type !== 'mc-en-fr' && state.settings.autoplay) later(() => Sound.play(it.id, it.fr), 250);
  }

  function exType(ex) {
    const it = C.findItem(D, ex.item);
    $('#ex').innerHTML = `
      <p class="instr">Write this in French</p>
      <div class="prompt-pic">${imgHtml(it, 'lg')}<b>${esc(it.en)}</b></div>
      <input type="text" id="answer" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in French…" aria-label="Your answer in French">
      <div class="accents">${ACCENTS.map((a) => `<button type="button" data-ch="${a}">${a}</button>`).join('')}</div>`;
    const input = $('#answer');
    input.focus();
    input.oninput = () => { $('#check').disabled = !input.value.trim(); };
    $$('.accents button').forEach((b) => (b.onmousedown = (e) => e.preventDefault()));
    $$('.accents button').forEach((b) => (b.onclick = () => {
      const s = input.selectionStart, en = input.selectionEnd;
      input.setRangeText(b.dataset.ch, s, en, 'end');
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
    const check = () => {
      if (!input.value.trim()) return;
      const res = C.checkAnswer(input.value, it.fr);
      input.disabled = true;
      $$('.accents button').forEach((b) => (b.disabled = true));
      const hint = res === 'accent' ? 'Watch the accents!' : res === 'article' ? 'Remember the article — it shows the gender.' : '';
      input.classList.add(res === 'wrong' ? 'wrong' : 'right');
      answered(ex, res !== 'wrong', { hint });
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && !input.disabled) { e.preventDefault(); check(); } };
  }

  function exMatch(ex) {
    const items = ex.pairs.map((id) => C.findItem(D, id));
    const left = C.shuffle(items), right = C.shuffle(items);
    $('#ex').innerHTML = `
      <p class="instr">Tap the matching pairs</p>
      <div class="match">
        <div class="col">${left.map((it) => `<button class="tile" data-id="${it.id}" data-side="fr" lang="fr">${fr(it.fr)}</button>`).join('')}</div>
        <div class="col">${right.map((it) => `<button class="tile" data-id="${it.id}" data-side="en">${esc(it.en)}</button>`).join('')}</div>
      </div>`;
    $('#foot').innerHTML = '<p class="muted small center">Match all four pairs</p>';
    let sel = null, mistakes = 0, matched = 0;
    $$('.tile').forEach((t) => (t.onclick = () => {
      if (t.classList.contains('matched')) return;
      if (t.dataset.side === 'fr') Sound.play(t.dataset.id, itemText(t.dataset.id));
      if (!sel || sel.dataset.side === t.dataset.side) {
        if (sel) sel.classList.remove('selected');
        sel = t; t.classList.add('selected');
        return;
      }
      const a = sel, b = t;
      sel = null;
      a.classList.remove('selected');
      if (a.dataset.id === b.dataset.id) {
        a.classList.add('matched'); b.classList.add('matched');
        a.disabled = b.disabled = true;
        Sound.sfx('tap');
        if (++matched === items.length) {
          const ok = mistakes === 0;
          later(() => answered(Object.assign({}, ex, { item: null }), ok, { hint: ok ? 'All pairs matched on the first try.' : `All matched — with ${mistakes} slip${mistakes === 1 ? '' : 's'}.` }), 250);
        }
      } else {
        mistakes++;
        Sound.sfx('bad');
        [a, b].forEach((x) => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 400); });
      }
    }));
    keyHandler = null;
  }

  function exOrder(ex) {
    const it = C.findItem(D, ex.item);
    const target = C.tokenize(it.ex.fr);
    $('#ex').innerHTML = `
      <p class="instr">Build the sentence in French</p>
      <div class="prompt-pic small">${imgHtml(it, 'md')}<b>${esc(it.ex.en)}</b></div>
      <div class="answer-line" id="line" lang="fr" aria-label="Your sentence"></div>
      <div class="bank" id="bank" lang="fr">${ex.tiles.map((w, k) => `<button class="word" data-k="${k}">${fr(w)}</button>`).join('')}</div>`;
    const line = $('#line'), bank = $('#bank');
    const update = () => { $('#check').disabled = line.children.length === 0; };
    bank.onclick = (e) => {
      const w = e.target.closest('.word');
      if (!w || w.disabled || w.classList.contains('used')) return;
      const c = w.cloneNode(true);
      c.onclick = () => { c.remove(); w.classList.remove('used'); update(); };
      w.classList.add('used');
      line.appendChild(c);
      Sound.sfx('tap');
      update();
    };
    const check = () => {
      const built = $$('.word', line).map((w) => ex.tiles[w.dataset.k]);
      const ok = C.normalize(built.join(' ')) === C.normalize(target.join(' '));
      $$('.word').forEach((w) => (w.disabled = true));
      line.classList.add(ok ? 'right' : 'wrong');
      answered(ex, ok);
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && line.children.length) { e.preventDefault(); check(); } };
  }

  function finishSession() {
    const s = session;
    const res = s.kind === 'lesson'
      ? C.completeLesson(state, D, s.unit.id, s.results)
      : C.completeReview(state, D, s.results);
    save();
    renderChrome('session');
    keyHandler = null;
    const pct = Math.round(res.score * 100);
    const mins = Math.max(1, Math.round((Date.now() - s.started) / 60000));
    const celebrate = res.perfect || res.goalReachedNow || res.achievements.length || res.milestones.length;
    Sound.sfx('win');
    if (celebrate) later(confetti, 150);
    const goal = state.settings.dailyGoal, xpToday = C.todayXp(state);
    view.innerHTML = `
      <section class="card center result-card">
        <img class="mascot bob" src="assets/img/mascot.svg" alt="">
        <h1>${s.kind === 'lesson' ? (res.perfect ? 'Parfait !' : 'Leçon terminée !') : 'Révision terminée !'}</h1>
        ${s.kind === 'lesson' ? `<p>${stars(res.stars)}</p><p class="sub">${esc(s.unit.title)} · ${esc(s.unit.en)}</p>` : ''}
        <div class="result-grid">
          <div><b>+${res.xp}</b><small>XP earned</small></div>
          <div><b>${pct}%</b><small>Accuracy</small></div>
          <div><b>${mins}</b><small>min${mins === 1 ? '' : 's'}</small></div>
        </div>
        <div class="goal-bar"><div class="progress"><i style="width:${Math.min(100, (xpToday / goal) * 100)}%"></i></div>
          <small>${xpToday >= goal ? `🎯 Daily goal reached (${xpToday}/${goal} XP)` : `${xpToday}/${goal} XP today`}</small></div>
        ${res.goalReachedNow ? `<div class="celebrate"><span class="celebrate-i">🎯</span><div><b>Objectif du jour atteint !</b><small>Daily goal reached — your streak is now ${C.currentStreak(state)} day${C.currentStreak(state) === 1 ? '' : 's'}.</small></div></div>` : ''}
        ${res.milestones.map((m) => `<div class="celebrate milestone-won">${ICON.trophy}<div><b>Milestone: ${esc(m.title)}</b><small>${esc(m.en)}</small></div></div>`).join('')}
        ${res.achievements.length ? `<h3>New achievement${res.achievements.length > 1 ? 's' : ''}</h3><div class="badges new">${res.achievements.map(badge).join('')}</div>` : ''}
        <div class="row">
          <a class="btn primary" href="#/">Continue</a>
          ${s.kind === 'lesson' && !res.perfect ? `<a class="btn secondary" href="#/practice/${s.unit.id}">Try for 3 stars</a>` : ''}
        </div>
      </section>`;
    session = null;
    keyHandler = (e) => { if (e.key === 'Enter') go('#/'); };
  }

  // ---------- progress ----------
  function badge(a, locked = false) {
    return `<div class="badge-card ${locked ? 'locked' : ''}" title="${esc(a.desc)}">
      <span class="medal"><span>${a.icon}</span></span>
      <b>${esc(a.title)}</b><small>${esc(a.desc)}</small>
    </div>`;
  }
  function heatmap() {
    const weeks = 18, t = today();
    const dow = (new Date(t + 'T12:00').getDay() + 6) % 7; // Monday = 0
    const start = C.addDays(t, -(weeks - 1) * 7 - dow);
    let cells = '';
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const key = C.addDays(start, w * 7 + d);
        if (key > t) { cells += '<i class="future"></i>'; continue; }
        const xp = (state.daily[key] && state.daily[key].xp) || 0;
        const lvl = xp === 0 ? 0 : xp < state.settings.dailyGoal / 2 ? 1 : xp < state.settings.dailyGoal ? 2 : xp < state.settings.dailyGoal * 2 ? 3 : 4;
        cells += `<i class="l${lvl}" title="${key}: ${xp} XP"></i>`;
      }
    }
    return `<div class="heat" style="--weeks:${weeks}">${cells}</div>
      <div class="heat-legend"><small>Less</small><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><small>More</small></div>`;
  }
  function progress() {
    renderChrome('progress');
    const lv = C.levelFor(state.xp);
    const st = state.stats;
    const acc = st.totalAnswered ? Math.round((st.totalCorrect / st.totalAnswered) * 100) + '%' : '—';
    const unlocked = C.ACHIEVEMENTS.filter((a) => state.achievements[a.id]);
    const days = Object.values(state.daily).filter((d) => d.xp > 0).length;
    view.innerHTML = `
      <h1 class="page-title">Progrès <small>Your progress</small></h1>
      <section class="card level">
        <div class="level-badge">${lv.level}</div>
        <div class="grow">
          <small class="eyebrow">Level ${lv.level}</small>
          <h2>${esc(lv.name)}</h2>
          <div class="progress"><i style="width:${lv.progress * 100}%"></i></div>
          <small class="muted">${lv.next ? `${state.xp} / ${lv.next} XP to level ${lv.level + 1}` : `${state.xp} XP · top level reached!`}</small>
        </div>
      </section>
      <section class="stat-grid">
        <div class="card stat"><span>🔥</span><b>${C.currentStreak(state)}</b><small>Day streak</small></div>
        <div class="card stat"><span>🏅</span><b>${state.streak.best}</b><small>Best streak</small></div>
        <div class="card stat"><span>📗</span><b>${Object.keys(state.words).length}</b><small>Words learned</small></div>
        <div class="card stat"><span>🧠</span><b>${C.masteredCount(state)}</b><small>Words mastered</small></div>
        <div class="card stat"><span>✏️</span><b>${st.lessons}</b><small>Lessons</small></div>
        <div class="card stat"><span>🎯</span><b>${acc}</b><small>Accuracy</small></div>
      </section>
      <section class="card">
        <h3>Activity <small class="muted">${days} day${days === 1 ? '' : 's'} studied · goal hit ${st.goalsHit}×</small></h3>
        ${heatmap()}
      </section>
      <section class="card">
        <h3>Milestones</h3>
        <ol class="timeline">${D.milestones.map((m) => {
          const reached = state.milestones[m.id];
          const done = Math.min(C.completedUnits(state, D), m.after);
          return `<li class="${reached ? 'reached' : ''}"><span class="dot">${reached ? ICON.check : ''}</span>
            <div><b>${esc(m.title)}</b><small>${reached ? `${esc(m.en)} · ${esc(reached)}` : `${done} / ${m.after} units`}</small>
            ${reached ? '' : `<div class="progress thin"><i style="width:${(done / m.after) * 100}%"></i></div>`}</div></li>`;
        }).join('')}</ol>
      </section>
      <section class="card">
        <h3>Achievements <small class="muted">${unlocked.length} / ${C.ACHIEVEMENTS.length}</small></h3>
        <div class="badges">${C.ACHIEVEMENTS.map((a) => badge(a, !state.achievements[a.id])).join('')}</div>
      </section>`;
  }

  // ---------- settings ----------
  function settings() {
    renderChrome('settings');
    const s = state.settings;
    const toggle = (key, title, sub) => `
      <label class="setting"><div><b>${title}</b><small>${sub}</small></div>
        <input type="checkbox" class="switch" data-key="${key}" ${s[key] ? 'checked' : ''}></label>`;
    view.innerHTML = `
      <h1 class="page-title">Réglages <small>Settings</small></h1>
      <section class="card">
        <label class="setting"><div><b>Your name</b><small>Coco will greet you by name</small></div>
          <input type="text" id="name" maxlength="24" value="${esc(s.name)}" placeholder="Optional"></label>
      </section>
      <section class="card">
        <h3>Daily goal</h3>
        <div class="goals">${C.GOALS.map((g) => `
          <button class="goal-opt ${s.dailyGoal === g.xp ? 'selected' : ''}" data-goal="${g.xp}">
            <b>${g.label}</b><small>${g.en} · ${g.xp} XP/day</small><span>≈ ${Math.max(1, Math.round(g.xp / 18))} lesson${g.xp > 20 ? 's' : ''}</span></button>`).join('')}
        </div>
      </section>
      <section class="card">
        <h3>Sound &amp; learning</h3>
        ${toggle('autoplay', 'Auto-play pronunciation', 'Hear each word automatically')}
        ${toggle('slowAudio', 'Slower audio', 'Play French audio at 75% speed')}
        ${toggle('sfx', 'Sound effects', 'Chimes for right and wrong answers')}
        ${toggle('unlockAll', 'Unlock all units', 'Skip ahead if you already know some French')}
        <label class="setting"><div><b>Appearance</b><small>Light, dark or match your system</small></div>
          <select id="theme">${['auto', 'light', 'dark'].map((t) => `<option value="${t}" ${s.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      </section>
      <section class="card">
        <h3>Your data</h3>
        <p class="muted small">🔒 Everything stays private in this browser. Nothing is sent anywhere — the app works fully offline. Export a backup to move your progress to another browser.</p>
        <div class="row">
          <button class="btn secondary" id="export">⬇️ Export backup</button>
          <label class="btn secondary">⬆️ Import backup<input type="file" id="import" accept="application/json,.json" hidden></label>
          <button class="btn danger-ghost" id="reset">Reset progress</button>
        </div>
      </section>
      <p class="muted small center">Audio: macOS “Thomas” French voice · Illustrations drawn for this app</p>`;
    $('#name').onchange = (e) => { s.name = e.target.value.trim(); save(); toast('✓', 'Saved'); };
    $$('.goal-opt').forEach((b) => (b.onclick = () => { s.dailyGoal = Number(b.dataset.goal); save(); settings(); toast('🎯', `Daily goal: ${s.dailyGoal} XP`); }));
    $$('.switch').forEach((c) => (c.onchange = () => { s[c.dataset.key] = c.checked; save(); }));
    $('#theme').onchange = (e) => { s.theme = e.target.value; save(); applyTheme(); };
    $('#export').onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `french-progress-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || typeof data !== 'object' || !('xp' in data) || !('words' in data)) throw new Error('not a backup');
        if (!confirm('Replace your current progress with this backup?')) return;
        state = C.migrate(data); save(); applyTheme(); toast('✓', 'Backup imported'); settings();
      } catch (err) { toast('⚠️', 'Import failed', 'That file is not a valid backup.'); }
    };
    $('#reset').onclick = () => {
      if (!confirm('Erase all progress, streaks and achievements? This cannot be undone (export a backup first if unsure).')) return;
      state = C.defaultState(); save(); applyTheme(); toast('↺', 'Progress reset'); go('#/');
    };
  }

  // ---------- boot ----------
  applyTheme();
  window.addEventListener('storage', (e) => {
    if (e.key !== C.STORAGE_KEY) return;
    state = load();
    applyTheme();
    if (!session) route();
  });
  route();
})();
