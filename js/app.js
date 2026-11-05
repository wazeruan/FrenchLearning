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

  // ---------- checkpoint: the practice or review in progress, so leaving doesn't lose it ----------
  function savedCheckpoint() {
    try {
      const cp = JSON.parse(localStorage.getItem(C.CHECKPOINT_KEY));
      return C.validCheckpoint(D, cp) ? cp : null;
    } catch (e) { return null; }
  }
  function saveCheckpoint(queue) {
    try {
      localStorage.setItem(C.CHECKPOINT_KEY, JSON.stringify({
        v: 1, kind: session.kind, unit: session.unit ? session.unit.id : null, queue, total: session.total,
        done: session.done, results: session.results, elapsed: Date.now() - session.started, savedAt: Date.now(),
      }));
    } catch (e) { /* storage unavailable: the session just can't be resumed */ }
  }
  function clearCheckpoint() { try { localStorage.removeItem(C.CHECKPOINT_KEY); } catch (e) { /* ignore */ } }
  // "Pick up where you left off" card for the home and review pages.
  function resumeCard(cp) {
    if (!cp) return '';
    const u = cp.kind === 'lesson' ? unitById(cp.unit) : null;
    const left = cp.queue.length;
    return `<section class="card resume-card">
      <span class="resume-i">⏸️</span>
      <div class="grow"><b>${u ? `Unfinished practice: ${esc(u.title)}` : 'Unfinished review'}</b>
        <small>${left ? `${left} exercise${left === 1 ? '' : 's'} to go` : 'Only the results are left'} · ${Math.round((cp.done / Math.max(1, cp.total)) * 100)}% done</small></div>
      <button class="btn danger-ghost" data-discard>Discard</button>
      <a class="btn primary" href="${u ? `#/practice/${u.id}` : '#/review/resume'}">Continue</a>
    </section>`;
  }
  function bindResumeCard() {
    const b = $('[data-discard]');
    if (b) b.onclick = () => { clearCheckpoint(); route(); };
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
  const TOUCH = matchMedia('(pointer: coarse)').matches; // phone or tablet: say "Tap", not "Click"
  const CLICK = TOUCH ? 'Tap' : 'Click';

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
    if (img.num) return `<span class="pic num ${cls}" aria-hidden="true">${esc(img.num)}</span>`;
    if (img.clock) return `<span class="pic clock ${cls}" aria-hidden="true">${clockSvg(img.clock)}</span>`;
    return `<span class="pic emoji ${cls}" aria-hidden="true">${img.emoji || '❓'}</span>`;
  }
  // Analog clock for "h:mm"; afternoon/evening times also show the 24-hour reading.
  function clockSvg(t) {
    const [h, m] = t.split(':').map(Number);
    const hourA = ((h % 12) + m / 60) * 30, minA = m * 6;
    const hand = (a, len, w) => `<line x1="50" y1="50" x2="${(50 + len * Math.sin(a * Math.PI / 180)).toFixed(1)}" y2="${(50 - len * Math.cos(a * Math.PI / 180)).toFixed(1)}" stroke-width="${w}" stroke-linecap="round"/>`;
    const ticks = Array.from({ length: 12 }, (_, i) => `<circle cx="${(50 + 38 * Math.sin(i * Math.PI / 6)).toFixed(1)}" cy="${(50 - 38 * Math.cos(i * Math.PI / 6)).toFixed(1)}" r="${i % 3 ? 1.6 : 2.8}"/>`).join('');
    return `<svg viewBox="0 0 100 ${h >= 13 ? 122 : 100}"><circle cx="50" cy="50" r="46" class="face"/><g class="ticks">${ticks}</g>
      <g class="hands">${hand(hourA, 24, 6)}${hand(minA, 34, 4)}</g><circle cx="50" cy="50" r="4" class="pin"/>
      ${h >= 13 ? `<text x="50" y="118" text-anchor="middle">${h} h ${String(m).padStart(2, '0')}</text>` : ''}</svg>`;
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
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg>',
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
  // Text of every non-word clip (grammar examples, drills, dialogue lines), for the browser-voice fallback.
  const CLIP_TEXT = {};
  for (const u of D.units) {
    if (u.grammar) {
      u.grammar.sections.flatMap((x) => x.examples || []).forEach(([t], i) => (CLIP_TEXT[`${u.id}-x${i + 1}`] = t));
      u.grammar.drills.forEach((d, i) => (CLIP_TEXT[`${u.id}-d${i + 1}`] = C.drillSpeech(d)));
    }
    if (u.dialogue) u.dialogue.lines.forEach(([, t], i) => (CLIP_TEXT[`${u.id}-l${i + 1}`] = t));
  }
  function itemText(audioId) {
    if (CLIP_TEXT[audioId]) return CLIP_TEXT[audioId];
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


  // ---------- speech (offline pronunciation check) ----------
  // Recording stays in this browser; recognition runs locally in a worker (js/asr-worker.js).
  const Speech = {
    worker: null, loading: null, pending: new Map(), seq: 0, onProgress: null, token: 0,
    missing: false, backend: null, // missing: the model could not be loaded (not installed) — hide speaking UI
    available() {
      return /^https?:$/.test(location.protocol) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
        'AudioWorkletNode' in window && 'Worker' in window && 'OfflineAudioContext' in window;
    },
    enabled() { return state.settings.speaking && this.available() && !this.missing; },
    load() {
      if (this.loading) return this.loading;
      this.loading = new Promise((resolve, reject) => {
        const fail = (msg) => {
          this.loading = null;
          if (this.worker) this.worker.terminate();
          this.worker = null;
          for (const p of this.pending.values()) p.reject(new Error(msg));
          this.pending.clear();
          reject(new Error(msg));
        };
        try { this.worker = new Worker('js/asr-worker.js', { type: 'module' }); }
        catch (e) { return fail('worker'); }
        this.worker.onerror = () => { this.missing = !this.backend; fail(this.backend ? 'Speech recognition stopped unexpectedly. Try again.' : 'The speech model is not installed. Run scripts/setup-speech.sh once.'); };
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'progress') { if (this.onProgress) this.onProgress(data); }
          else if (data.type === 'ready') { this.backend = data.backend; resolve(); }
          else if (data.id === undefined) { this.missing = true; fail('The speech model is not installed. Run scripts/setup-speech.sh once.'); }
          else {
            const p = this.pending.get(data.id);
            this.pending.delete(data.id);
            if (p) data.type === 'result' ? p.resolve(data.text) : p.reject(new Error(data.message));
          }
        };
        this.worker.postMessage({ type: 'load' });
      });
      return this.loading;
    },
    // hint: vocabulary given to the recognizer as context (nudges it toward course words).
    // supersede: older queued checks that haven't started yet are skipped (only the newest attempt matters).
    async transcribe(audio, hint, { supersede = false } = {}) {
      await this.load();
      const id = ++this.seq;
      return new Promise((resolve, reject) => {
        const limit = this.backend === 'webgpu' ? 20000 : 60000;
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Recognition took too long. Try again.')); }, limit);
        this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
        this.worker.postMessage({ type: 'transcribe', id, audio, hint, supersede }, [audio.buffer]);
      });
    },
    // Invalidates pending results (e.g. after navigation) and discards an unfinished recording.
    cancel() { this.token++; Mic.abort(); },
  };

  // ---------- microphone (kept warm while practising) ----------
  // After the first tap, the mic stays open on speaking screens so the next recording starts instantly;
  // a rolling 0.8 s buffer means words started just before the tap are kept too. It closes when you
  // leave the page or after a minute without use.
  const PREROLL_S = 0.8;
  const Mic = {
    stream: null, ctx: null, opening: null, rate: 48000, ring: [], ringLen: 0, rec: null, onChunk: null, idle: 0,
    owner: 0, seq: 0, gen: 0, // owner: id of the recording in progress; gen: bumped by close() to cancel a pending open()
    get live() { return !!(this.stream && this.stream.active && this.ctx && this.ctx.state === 'running'); },
    get recording() { return !!this.rec; },
    async open() {
      if (this.live) { this.touch(); return; }
      if (this.ctx && this.stream && this.stream.active && this.ctx.state !== 'closed') { // paused by the system (sleep, device change)
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 800))]);
        if (this.live) { this.touch(); return; }
        this.close();
      }
      if (this.opening) return this.opening;
      const gen = this.gen;
      this.opening = (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          await ctx.audioWorklet.addModule('js/mic-worklet.js');
          const node = new AudioWorkletNode(ctx, 'mic-tap');
          const mute = ctx.createGain();
          mute.gain.value = 0; // keeps the graph running without playing the mic back
          ctx.createMediaStreamSource(stream).connect(node);
          node.connect(mute).connect(ctx.destination);
          node.port.onmessage = ({ data }) => this.push(data);
          // resume() can stay pending without a user gesture; don't wait for it forever.
          if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 800))]);
          if (gen !== this.gen) { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); return; } // closed meanwhile
          if (ctx.state !== 'running') { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); throw new Error(`The microphone could not start. ${CLICK} the mic again.`); }
          Object.assign(this, { stream, ctx, rate: ctx.sampleRate, ring: [], ringLen: 0 });
        } catch (e) {
          stream.getTracks().forEach((t) => t.stop());
          throw e;
        }
        this.touch();
      })().finally(() => { this.opening = null; });
      return this.opening;
    },
    push(chunk) {
      if (this.rec) {
        this.rec.push(chunk);
        if (this.onChunk) this.onChunk(chunk);
        return;
      }
      this.ring.push(chunk);
      this.ringLen += chunk.length;
      while (this.ring.length > 1 && this.ringLen - this.ring[0].length > this.rate * PREROLL_S) this.ringLen -= this.ring.shift().length;
    },
    // Starts recording (including the rolling pre-roll buffer); returns an id that owns the recording.
    start(onChunk) {
      clearTimeout(this.idle);
      this.rec = this.ring;
      this.ring = [];
      this.ringLen = 0;
      this.onChunk = onChunk;
      return (this.owner = ++this.seq);
    },
    // Discards the recording in progress, whoever owns it.
    abort() { this.rec = null; this.onChunk = null; this.owner = 0; },
    // Ends the recording `id` and returns its samples (at this.rate), or null if it isn't the current one.
    stop(id) {
      if (!id || id !== this.owner) return null;
      const chunks = this.rec || [];
      this.rec = null;
      this.onChunk = null;
      this.owner = 0;
      const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      this.touch();
      return out;
    },
    touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.close(), 60000); },
    close() {
      clearTimeout(this.idle);
      this.gen++;
      this.abort();
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) this.ctx.close().catch(() => {});
      Object.assign(this, { stream: null, ctx: null, ring: [], ringLen: 0 });
    },
  };
  const rmsOf = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / (a.length || 1)); };

  // Resamples a recording to 16 kHz mono (what Whisper expects) and trims silence. Returns { pcm, peak }.
  async function toPcm16k(raw, rate) {
    if (raw.length < rate * 0.1) return { pcm: new Float32Array(0), peak: 0 };
    const off = new OfflineAudioContext(1, Math.ceil(raw.length * 16000 / rate), 16000);
    const buf = off.createBuffer(1, raw.length, rate);
    buf.copyToChannel(raw, 0);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const frame = 320, rms = [];
    for (let i = 0; i < pcm.length; i += frame) rms.push(rmsOf(pcm.subarray(i, i + frame)));
    const peak = Math.max(0, ...rms);
    const thr = Math.max(0.01, peak * 0.12);
    const first = rms.findIndex((v) => v > thr), last = rms.length - 1 - [...rms].reverse().findIndex((v) => v > thr);
    if (first < 0) return { pcm: new Float32Array(0), peak };
    const pad = 0.2 * 16000;
    return { pcm: pcm.slice(Math.max(0, first * frame - pad), Math.min(pcm.length, (last + 1) * frame + pad)), peak };
  }
  // 16-bit WAV, for "Your voice" playback.
  function wavBlob(pcm, rate) {
    const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o, t) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, pcm.length * 2, true);
    pcm.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
    return new Blob([view], { type: 'audio/wav' });
  }

  const SPEAK_FEEDBACK = {
    great: { icon: '🎉', title: 'Excellent !', sub: 'That sounded right.' },
    close: { icon: '👍', title: 'Presque !', sub: 'Close — listen to Coco and try once more.' },
    retry: { icon: '🔁', title: 'Essaie encore', sub: 'Listen to Coco first, then say it slowly.' },
  };
  function speakWidget(it) {
    return `<div class="speak" data-speak>
      <button type="button" class="mic" aria-label="Record yourself saying ${esc(it.fr)}">${ICON.mic}</button>
      <div class="speak-body"><p class="speak-status" role="status" aria-live="polite">${CLICK} the mic and say <b lang="fr">${fr(it.fr)}</b></p><div class="speak-result" hidden></div></div>
    </div>`;
  }
  // Wires a speak widget. Recording and recognition are independent: tap → record at once (the mic is
  // kept warm, recording stops by itself after you finish speaking) → recognition runs in the background
  // while you can already record again; only the latest attempt's result is shown. onScore(score) per result.
  function bindSpeak(el, it, onScore) {
    const mic = $('.mic', el), status = $('.speak-status', el), result = $('.speak-result', el);
    let attempts = 0, voiceUrl = null, finish = null;
    const setStatus = (html) => { if (el.isConnected) status.innerHTML = html; };
    const showMic = (recording) => {
      el.classList.toggle('recording', recording);
      if (!recording) el.style.setProperty('--lvl', 0);
      mic.innerHTML = recording ? ICON.stop : ICON.mic;
      mic.setAttribute('aria-label', recording ? 'Stop recording' : `Record yourself saying ${it.fr}`);
    };
    // Free the previous recording once the widget leaves the page.
    const cleanup = new MutationObserver(() => { if (!el.isConnected) { if (voiceUrl) URL.revokeObjectURL(voiceUrl); cleanup.disconnect(); } });
    cleanup.observe(document.getElementById('view'), { childList: true });
    // Example sentences (<id>-ex) and dialogue lines (<unit>-l<n>) use their unit's words as the hint too.
    const unit = D.units.find((u) => u.items.some((x) => x.id === it.id || `${x.id}-ex` === it.id)) || unitById(it.id.split('-')[0]);
    const hint = unit ? unit.items.map((x) => x.fr).join(', ') + '.' : '';

    mic.onclick = async () => {
      if (finish) return finish(); // tapping while recording stops it
      if (Speech.missing) { el.hidden = true; return; }
      Sound.stop();
      Speech.load().catch(() => {}); // already warming up in the background; never waited on here
      try {
        if (!Mic.live) { setStatus('Opening the microphone…'); await Mic.open(); }
      } catch (err) {
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        return setStatus(denied ? 'Microphone access is blocked. Allow it for Coco · French, then try again.' : esc(err.message || 'The microphone could not be opened.'));
      }
      if (!el.isConnected || Mic.recording) return;
      const token = Speech.token;
      const attempt = ++attempts; // a new tap makes any older, still-running check stale
      result.hidden = true;
      el.classList.remove('thinking');
      // End-of-speech detection: stop ~0.9 s after you finish talking (or after 6 s).
      const floor = Math.max(0.006, ...Mic.ring.map(rmsOf).sort((x, y) => x - y).slice(0, 3));
      let spoke = false, silent = 0, total = 0;
      let recId = 0;
      const myFinish = finish = () => {
        if (finish !== myFinish) return;
        finish = null;
        clearTimeout(noSpeech);
        showMic(false);
        const raw = Mic.stop(recId); // null if this recording was discarded (page changed) — never touches a newer one
        if (raw && token === Speech.token && el.isConnected) recognize(raw, Mic.rate || 48000, attempt, token);
      };
      const noSpeech = setTimeout(() => { if (!spoke && finish === myFinish) myFinish(); }, 5000);
      recId = Mic.start((chunk) => {
        const level = rmsOf(chunk);
        el.style.setProperty('--lvl', Math.min(1, level * 6).toFixed(2));
        total += chunk.length;
        if (level > Math.max(0.015, floor * 3)) { spoke = true; silent = 0; } else if (spoke) silent += chunk.length;
        if ((spoke && silent > Mic.rate * 0.9) || total > Mic.rate * 6) myFinish();
      });
      showMic(true);
      setStatus('Listening… it stops by itself when you finish');
    };

    async function recognize(raw, rate, attempt, token) {
      const current = () => attempt === attempts && token === Speech.token && el.isConnected;
      el.classList.add('thinking');
      setStatus(Speech.backend === 'wasm' ? `Checking… (this ${TOUCH ? 'device' : 'computer'} has no GPU support, so it can take ~10 s)` : `Checking… ${CLICK.toLowerCase()} the mic anytime to try again`);
      Speech.onProgress = (p) => { if (current() && el.classList.contains('thinking')) setStatus(`Checking… Coco's ears are warming up (${Math.round(p.progress || 0)}%)`); };
      try {
        const { pcm, peak } = await toPcm16k(raw, rate);
        if (!current()) return;
        if (pcm.length < 1600 || peak < 0.008) return setStatus("I didn't hear anything — check your mic and speak a little louder.");
        const voice = wavBlob(pcm, 16000);
        let heard = await Speech.transcribe(pcm, hint, { supersede: true });
        if (!current()) return; // a newer attempt (or navigation) replaced this one
        // On noise Whisper can echo the vocabulary hint back; a long list is not an answer.
        if (heard.split(/\s+/).length > it.fr.split(/\s+/).length + 4) heard = '';
        if (voiceUrl) URL.revokeObjectURL(voiceUrl);
        voiceUrl = URL.createObjectURL(voice);
        const score = C.pronunciationScore(heard, it.fr);
        const level = C.pronunciationLevel(score);
        const f = SPEAK_FEEDBACK[level];
        Sound.sfx(level === 'great' ? 'good' : level === 'close' ? 'tap' : 'bad');
        setStatus(`${CLICK} the mic to try again`);
        result.className = `speak-result ${level}`;
        result.innerHTML = `
          <div class="speak-score"><span class="speak-icon">${f.icon}</span><div><b>${f.title}</b><small>${f.sub}</small></div>
            <span class="meter" aria-label="${Math.round(score * 100)}%"><i style="width:${Math.round(score * 100)}%"></i></span></div>
          <p class="heard">Coco heard: <b lang="fr">${heard ? '«&nbsp;' + esc(heard) + '&nbsp;»' : '(nothing clear)'}</b></p>
          <div class="speak-actions">
            <button type="button" class="chip-btn" data-voice>${ICON.play} Your voice</button>
            <button type="button" class="chip-btn" data-audio="${it.id}">${ICON.speaker} Coco</button>
          </div>`;
        result.hidden = false;
        $('[data-voice]', result).onclick = () => { Sound.stop(); const a = new Audio(voiceUrl); Sound.current = a; a.play().catch(() => {}); };
        if (level === 'great') {
          state.stats.spokenGood++;
          C.evaluateProgress(state, D).achievements.forEach((a) => toast(a.icon, `Achievement: ${a.title}`, a.desc));
        }
        const day = state.daily[today()] || (state.daily[today()] = { xp: 0, lessons: 0, reviews: 0, minutes: 0, listening: 0 });
        day.spoken = (day.spoken || 0) + 1;
        save();
        if (onScore) onScore(score);
      } catch (err) {
        if (!el.isConnected) return;
        if (Speech.missing) { el.hidden = true; Mic.close(); toast('🎤', 'Speaking practice unavailable', 'Run scripts/setup-speech.sh once to install the speech model.'); return; }
        if (current()) setStatus(esc((err && err.message) || 'Something went wrong with speech recognition.'));
      } finally {
        if (attempt === attempts) el.classList.remove('thinking');
      }
    }
  }

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
    if (window.CocoAndroid) window.CocoAndroid.setTheme(t); // match the status and navigation bars
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
    Speech.cancel();
    Mic.close(); // the mic only stays open while you stay on a speaking screen
    session = null;
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    const routes = { '': home, unit: unitIntro, learn, grammar: grammarLesson, dialogue: dialogueView, roleplay: roleplayView, practice: startPractice, review, progress, settings };
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
  const KIND_LABEL = { grammar: 'Grammar', dialogue: 'Dialogue', sounds: 'Sounds' };
  // Suggested skill drill for today: the latest unlocked dialogue, else speaking on the current words.
  function skillDrill() {
    const latestFirst = D.units.filter((u, i) => u.dialogue && C.unitUnlocked(state, D, i)).reverse();
    // The most recent dialogue you've done, otherwise the first one you can open.
    const d = latestFirst.find((u) => state.units[u.id]) || latestFirst[latestFirst.length - 1];
    if (d) return { href: `#/dialogue/${d.id}`, label: `🎧 Listen: ${d.title}`, dialogue: true };
    const u = D.units[nextUnitIndex()];
    return { href: `#/learn/${u.id}`, label: `🎤 Say the words of “${u.title}” aloud`, dialogue: false };
  }
  function todayPlan() {
    const day = state.daily[today()] || {};
    const due = C.dueWords(state).length;
    const next = D.units[nextUnitIndex()];
    const drill = skillDrill();
    const hasWords = Object.keys(state.words).length > 0;
    const steps = [
      // Nothing to review yet (or nothing due) counts as done.
      { done: hasWords && ((day.reviews || 0) > 0 || !due), na: !hasWords, href: hasWords ? '#/review' : `#/unit/${next.id}`, label: due ? `🔁 Review ${due} word${due === 1 ? '' : 's'}` : hasWords ? '🔁 Review — all caught up' : '🔁 Review — starts after your first lesson', mins: 5 },
      { done: (day.lessons || 0) > 0, href: `#/unit/${next.id}`, label: `📘 ${esc(next.title)}`, mins: 15 },
      { done: drill.dialogue ? (day.listening || 0) > 0 : (day.spoken || 0) > 0, href: drill.href, label: esc(drill.label), mins: 10 },
    ];
    const mins = Math.round(day.minutes || 0);
    return `<section class="card today-card">
      <div class="today-head"><h3>Today's 30 minutes</h3><span class="today-min">${mins} min studied</span></div>
      <ol class="steps">${steps.map((st) => `<li class="${st.done ? 'done' : st.na ? 'na' : ''}"><a href="${st.href}">
        <span class="check">${st.done ? ICON.check : ''}</span><span class="step-label">${st.label}</span><small>~${st.mins} min</small></a></li>`).join('')}</ol>
    </section>`;
  }
  function home() {
    renderChrome('home');
    const xpToday = C.todayXp(state), goal = state.settings.dailyGoal;
    const streak = C.currentStreak(state);
    const next = D.units[nextUnitIndex()];
    const allDone = C.completedUnits(state, D) === D.units.length;
    let bubble;
    if (xpToday >= goal) bubble = `Objectif atteint ! You hit today's goal. À demain !`;
    else if (streak > 0 && xpToday === 0) bubble = `Keep your <b>${streak}-day</b> streak alive — one lesson is enough.`;
    else if (!state.stats.lessons) bubble = `I'm Coco. Step by step, we'll get you to NCLC 7. Let's start!`;
    else bubble = `${goal - xpToday} XP to go for today's goal. Allez !`;

    let path = '';
    D.units.forEach((u, i) => {
      const stage = D.stages.find((x) => x.units[0] === u.id);
      if (stage) {
        const pr = C.stageProgress(state, D, stage.id);
        path += `<li class="stage-head"><span class="stage-level">${esc(stage.level)}</span>
          <div><b>Stage ${D.stages.indexOf(stage) + 1} · ${esc(stage.title)}</b><small>${esc(stage.nclc)} · ${esc(stage.en)}</small></div>
          <span class="stage-count">${pr.done}/${pr.total}</span></li>`;
      }
      const st = state.units[u.id] || {};
      const unlocked = C.unitUnlocked(state, D, i);
      const current = unlocked && !st.completed && i === nextUnitIndex();
      const cls = st.completed ? 'done' : current ? 'current' : unlocked ? 'open' : 'locked';
      path += `
        <li class="node ${cls} ${u.kind || 'vocab'}" style="--i:${i}">
          <a ${unlocked ? `href="#/unit/${u.id}"` : 'aria-disabled="true"'} class="node-link">
            <span class="node-art"><img src="assets/img/units/${u.cover}.svg" alt="" loading="lazy">${!unlocked ? `<span class="lock">${ICON.lock}</span>` : ''}</span>
            <span class="node-text">
              <small>${i + 1}${KIND_LABEL[u.kind] ? ` · ${KIND_LABEL[u.kind]}` : ''}</small>
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
        </div>
      </section>
      ${resumeCard(savedCheckpoint())}
      ${todayPlan()}
      <h2 class="section-title">Your path to NCLC 7 <small>${C.completedUnits(state, D)} / ${D.units.length} units</small></h2>
      <ol class="path">${path}</ol>
      <p class="muted small center">More stages (A2, exam trainer, B1, B2) are on the way — see ROADMAP.md.</p>`;
    bindResumeCard();
  }

  // ---------- unit intro ----------
  function unitIntro(id) {
    const u = unitById(id);
    if (!u) return go('#/');
    const i = D.units.indexOf(u);
    if (!C.unitUnlocked(state, D, i)) return go('#/');
    renderChrome('home');
    const st = state.units[u.id];
    const steps = unitSteps(u);
    const cp = savedCheckpoint();
    const resume = cp && cp.kind === 'lesson' && cp.unit === u.id ? cp : null;
    view.innerHTML = `
      <a class="back" href="#/">← Back</a>
      <section class="card unit-intro">
        <img class="unit-cover" src="assets/img/units/${u.cover}.svg" alt="">
        <small class="eyebrow">${i + 1} · ${KIND_LABEL[u.kind] || 'Vocabulary'} · ${u.items.length} ${u.kind === 'vocab' || !u.kind ? 'words' : u.kind === 'sounds' ? 'key words' : 'key phrases'}</small>
        <h1>${esc(u.title)}</h1>
        <p class="sub">${esc(u.en)}</p>
        ${st ? `<p>${stars(st.stars)} <small class="muted">Best ${Math.round(st.bestScore * 100)}%</small></p>` : ''}
        <div class="tip"><b>💡 Le saviez-vous ?</b><p>${fr(u.tip)}</p></div>
        <ul class="word-chips">${u.items.map((it) => `<li><button data-audio="${it.id}">${imgHtml(it, 'xs')}<span lang="fr">${fr(it.fr)}</span></button></li>`).join('')}</ul>
        <ol class="unit-steps">${steps.map((sp, k) => (sp.route === 'practice' && resume
          ? `<li><a class="btn primary" href="#/practice/${u.id}">✏️ ${resume.queue.length ? `Continue practice (${resume.queue.length} left)` : 'See your practice results'}</a></li>`
          : `<li><a class="btn ${k === 0 && !st && !resume ? 'primary' : 'secondary'}" href="#/${sp.route}/${u.id}">${sp.label}</a></li>`)).join('')}</ol>
        ${resume ? `<p class="center small"><button type="button" class="link-btn" id="restart">Start the practice over</button></p>` : ''}
      </section>`;
    bindRestart(u);
  }
  // (bound by unitIntro) "Start the practice over" drops the saved checkpoint.
  function bindRestart(u) {
    const b = $('#restart');
    if (b) b.onclick = () => { clearCheckpoint(); go(`#/practice/${u.id}`); };
  }
  // The guided order of a unit: dialogues start by listening; grammar has its lesson after the forms.
  function unitSteps(u) {
    const learnStep = { route: 'learn', label: u.kind === 'grammar' ? '📖 Learn the forms' : u.kind === 'dialogue' ? '📖 Key phrases' : u.kind === 'sounds' ? '📖 Key words' : '📖 Learn the words' };
    const practice = { route: 'practice', label: '✏️ Practice' };
    if (u.kind === 'grammar') return [learnStep, { route: 'grammar', label: '📘 Grammar lesson' }, practice];
    if (u.kind === 'sounds') return [{ route: 'grammar', label: '🔤 The vowel sounds' }, learnStep, practice];
    if (u.kind === 'dialogue') return [{ route: 'dialogue', label: '🎧 Listen to the dialogue' }, learnStep, { route: 'roleplay', label: '🎭 Role-play' }, practice];
    return [learnStep, practice];
  }
  function nextStep(u, route) {
    const steps = unitSteps(u);
    const k = steps.findIndex((sp) => sp.route === route);
    return steps[k + 1] || null;
  }

  // ---------- learn (flashcards) ----------
  function learn(id) {
    const u = unitById(id);
    if (!u || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    renderChrome('session');
    let i = 0;
    const after = nextStep(u, 'learn') || { route: 'practice', label: '✏️ Practice' };
    const draw = () => {
      const it = u.items[i];
      Speech.cancel();
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
          ${Speech.enabled() ? speakWidget(it) : ''}
          <div class="example">
            ${speakerBtn(it.id + '-ex', 'Play example')}
            <div><p class="ex-fr">${fr(it.ex.fr)}</p><p class="ex-en" lang="en">${esc(it.ex.en)}</p></div>
          </div>
        </article>
        <div class="session-foot">
          <button class="btn secondary" id="prev" ${i === 0 ? 'disabled' : ''}>← Back</button>
          <button class="btn primary" id="next">${i === u.items.length - 1 ? `${after.label} →` : 'Next →'}</button>
        </div>`;
      $('#prev').onclick = () => { if (i > 0) { i--; draw(); } };
      $('#next').onclick = () => { if (i < u.items.length - 1) { i++; draw(); } else go(`#/${after.route}/${u.id}`); };
      if ($('[data-speak]')) {
        bindSpeak($('[data-speak]'), it);
        Speech.load().catch(() => {}); // warm up the recognizer in the background
      }
      if (state.settings.autoplay) later(() => Sound.play(it.id, it.fr), 200);
    };
    keyHandler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') $('#next') && $('#next').click();
      else if (e.key === 'ArrowLeft') $('#prev') && $('#prev').click();
      else if (e.key === ' ') { e.preventDefault(); Sound.play(u.items[i].id, u.items[i].fr); }
    };
    draw();
  }

  // ---------- grammar lesson ----------
  function grammarLesson(id) {
    const u = unitById(id);
    if (!u || !u.grammar || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    renderChrome('session');
    const after = nextStep(u, 'grammar');
    let x = 0;
    view.innerHTML = `
      <div class="session-head">
        <a class="icon-btn" href="#/unit/${u.id}" aria-label="Close">${ICON.close}</a>
        <h2 class="session-title">📘 ${esc(u.title)}</h2>
      </div>
      ${u.grammar.sections.map((sec) => `
        <section class="card grammar">
          <h3>${esc(sec.h)}</h3>
          ${sec.table ? `<table class="gtable" lang="fr">${sec.table.map(([a, b]) => `<tr><td>${fr(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>` : ''}
          ${sec.p ? `<p>${fr(sec.p)}</p>` : ''}
          ${(sec.examples || []).map(([f, e]) => `<div class="example">${speakerBtn(`${u.id}-x${++x}`, 'Play example')}<div><p class="ex-fr" lang="fr">${fr(f)}</p><p class="ex-en">${esc(e)}</p></div></div>`).join('')}
        </section>`).join('')}
      <div class="session-foot"><a class="btn primary wide" href="#/${after.route}/${u.id}">${after.label} →</a></div>`;
  }

  // ---------- dialogue (listening) ----------
  function dialogueView(id) {
    const u = unitById(id);
    if (!u || !u.dialogue || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    renderChrome('session');
    const dlg = u.dialogue;
    const after = nextStep(u, 'dialogue');
    const started = Date.now();
    const questions = dlg.questions.map(([q, en, opts, k]) => ({ q, en, answer: opts[k], options: C.shuffle(opts) }));
    view.innerHTML = `
      <div class="session-head">
        <a class="icon-btn" href="#/unit/${u.id}" aria-label="Close">${ICON.close}</a>
        <h2 class="session-title">🎧 ${esc(u.title)}</h2>
      </div>
      <section class="card dialogue">
        <p class="scene">${esc(dlg.scene)}</p>
        <div class="dlg-controls">
          <button class="btn primary" id="play-all">${ICON.play} Play the dialogue</button>
          <label class="toggle-chip"><input type="checkbox" id="show-text"> Show text</label>
          <label class="toggle-chip"><input type="checkbox" id="show-en"> English</label>
        </div>
        <p class="muted small">Tip: listen once without the text, answer the questions, then read along.</p>
        <ol class="lines hide-text hide-en" id="lines">${dlg.lines.map(([who, f, e], k) => `
          <li class="line ${who === 'A' ? 'a' : 'b'}" data-k="${k}">
            <button class="speaker" data-audio="${u.id}-l${k + 1}" aria-label="Play line ${k + 1}">${ICON.speaker}</button>
            <div><small class="who">${esc(dlg.speakers[who][0])}</small><p class="l-fr" lang="fr">${fr(f)}</p><p class="l-en">${esc(e)}</p></div>
          </li>`).join('')}</ol>
      </section>
      <section class="card">
        <h3>Questions</h3>
        <ol class="questions">${questions.map((q, n) => `
          <li data-n="${n}"><p class="q-fr" lang="fr">${fr(q.q)}</p><p class="q-en">${esc(q.en)}</p>
            <div class="q-opts">${q.options.map((o) => `<button class="option small" lang="fr" data-o="${esc(o)}">${fr(o)}</button>`).join('')}</div></li>`).join('')}</ol>
        <div id="dlg-result"></div>
      </section>`;
    const lines = $('#lines');
    $('#show-text').onchange = (e) => lines.classList.toggle('hide-text', !e.target.checked);
    $('#show-en').onchange = (e) => lines.classList.toggle('hide-en', !e.target.checked);
    // Plays every line in order, highlighting the current one; any navigation or Sound.stop() ends it.
    let playing = 0;
    lines.addEventListener('click', (e) => { if (e.target.closest('[data-audio]')) playing++; }, true); // a tapped line stops auto-play
    $('#play-all').onclick = async () => {
      const run = ++playing;
      for (let k = 0; k < dlg.lines.length; k++) {
        if (run !== playing || !lines.isConnected) { $$('.line', lines).forEach((li) => li.classList.remove('now')); return; }
        $$('.line', lines).forEach((li) => li.classList.toggle('now', Number(li.dataset.k) === k));
        await playClip(`${u.id}-l${k + 1}`);
        await new Promise((r) => later(r, 350));
      }
      $$('.line', lines).forEach((li) => li.classList.remove('now'));
    };
    let answered = 0, correct = 0;
    $$('.questions li').forEach((li) => {
      const q = questions[Number(li.dataset.n)];
      $$('.option', li).forEach((b) => (b.onclick = () => {
        if (li.classList.contains('answered')) return;
        li.classList.add('answered');
        const ok = b.dataset.o === q.answer;
        $$('.option', li).forEach((x) => { x.disabled = true; if (x.dataset.o === q.answer) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        Sound.sfx(ok ? 'good' : 'bad');
        answered++; if (ok) correct++;
        if (answered === questions.length) finishDialogue();
      }));
    });
    function finishDialogue() {
      const res = C.completeListening(state, D, { correct, total: questions.length }, new Date(), (Date.now() - started) / 60000);
      save();
      renderChrome('session');
      res.achievements.forEach((a) => toast(a.icon, `Achievement: ${a.title}`, a.desc));
      res.milestones.forEach((m) => toast('🏆', `Milestone: ${m.title}`, m.en));
      if (res.goalReachedNow) { toast('🎯', 'Objectif du jour atteint !', `Daily goal reached — ${C.currentStreak(state)}-day streak.`); confetti(); Sound.sfx('win'); }
      $('#dlg-result').innerHTML = `<div class="celebrate"><span class="celebrate-i">${correct === questions.length ? '🎉' : '👂'}</span>
        <div><b>${correct} / ${questions.length} correct · +${res.xp} XP</b><small>Now listen once more while reading the text.</small></div></div>
        <div class="row center-row"><a class="btn primary" href="#/${after.route}/${u.id}">${after.label} →</a></div>`;
      $('#show-text').checked = true; lines.classList.remove('hide-text');
    }
  }
  // ---------- role-play (dialogue, your turn) ----------
  // You take one part of the dialogue: hear the other person, choose what you say (then say it aloud
  // when speaking practice is on). Counts as listening practice: 2 XP + 1 per reply right first time.
  function roleplayView(id) {
    const u = unitById(id);
    if (!u || !u.dialogue || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    renderChrome('session');
    const dlg = u.dialogue;
    const after = nextStep(u, 'roleplay');
    const started = Date.now();
    const role = 'B', other = 'A';
    const me = dlg.speakers[role][0], them = dlg.speakers[other][0];
    const turns = C.roleplayTurns(dlg, role);
    const clip = (k) => `${u.id}-l${k + 1}`;
    view.innerHTML = `
      <div class="session-head">
        <a class="icon-btn" href="#/unit/${u.id}" aria-label="Close">${ICON.close}</a>
        <h2 class="session-title">🎭 ${esc(u.title)}</h2>
      </div>
      <section class="card dialogue">
        <p class="scene">${esc(dlg.scene)}</p>
        <p>You are <b>${esc(me)}</b>. Listen to ${esc(them)}, then choose what you say.</p>
        <div class="dlg-controls"><label class="toggle-chip"><input type="checkbox" id="rp-text" checked> Show text</label>
          <label class="toggle-chip"><input type="checkbox" id="rp-en"> English</label></div>
        <ol class="lines hide-en" id="rp-lines"></ol>
        <div class="rp-turn" id="rp-turn"></div>
      </section>`;
    const lines = $('#rp-lines'), turnBox = $('#rp-turn');
    $('#rp-text').onchange = (e) => lines.classList.toggle('hide-text', !e.target.checked);
    $('#rp-en').onchange = (e) => lines.classList.toggle('hide-en', !e.target.checked);
    const addLine = (k) => {
      const [who, f, e] = dlg.lines[k];
      const li = document.createElement('li');
      li.className = `line ${who === 'A' ? 'a' : 'b'}`;
      li.innerHTML = `${speakerBtn(clip(k), `Play line ${k + 1}`)}<div><small class="who">${esc(who === role ? `${me} (you)` : them)}</small><p class="l-fr" lang="fr">${fr(f)}</p><p class="l-en">${esc(e)}</p></div>`;
      lines.appendChild(li);
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return li;
    };
    let k = 0, t = 0, correct = 0;
    const alive = () => lines.isConnected;
    // Plays the other person's lines until it's your turn (or the end).
    async function advance() {
      turnBox.innerHTML = '';
      while (k < dlg.lines.length && dlg.lines[k][0] !== role) {
        const li = addLine(k);
        li.classList.add('now');
        await playClip(clip(k));
        if (!alive()) return;
        li.classList.remove('now');
        await new Promise((r) => later(r, 250));
        k++;
      }
      if (k >= dlg.lines.length) return finish();
      yourTurn(turns[t]);
    }
    function yourTurn(turn) {
      let first = true;
      turnBox.innerHTML = `<p class="q-fr">Your turn — what do you say?</p>
        <div class="q-opts">${turn.options.map((o, n) => `<button class="option small" lang="fr" data-o="${o}"><kbd>${n + 1}</kbd><span>${fr(dlg.lines[o][1])}</span></button>`).join('')}</div>`;
      const opts = $$('.option', turnBox);
      const choose = (b) => {
        if (b.disabled) return;
        const ok = Number(b.dataset.o) === turn.line;
        Sound.sfx(ok ? 'good' : 'bad');
        if (!ok) {
          first = false;
          b.classList.add('wrong'); b.disabled = true;
          return;
        }
        if (first) correct++;
        keyHandler = null;
        b.classList.add('right');
        opts.forEach((x) => (x.disabled = true));
        addLine(turn.line);
        playClip(clip(turn.line));
        const said = { id: clip(turn.line), fr: dlg.lines[turn.line][1] };
        const done = () => { if (t !== turns.indexOf(turn)) return; keyHandler = null; k = turn.line + 1; t++; advance(); };
        turnBox.innerHTML = `${first ? '' : '<p class="muted small">Not quite the first time — this one fits the conversation.</p>'}
          ${Speech.enabled() ? `<p class="muted small why">Now say it aloud, as ${esc(me)} would.</p>${speakWidget(said)}` : ''}
          <div class="row center-row"><button class="btn primary" id="rp-next">Continue →</button></div>`;
        if (Speech.enabled()) bindSpeak($('[data-speak]', turnBox), said);
        $('#rp-next').onclick = done;
        keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } };
      };
      opts.forEach((b) => (b.onclick = () => choose(b)));
      keyHandler = (e) => { const n = Number(e.key); if (n >= 1 && n <= opts.length) choose(opts[n - 1]); };
    }
    function finish() {
      keyHandler = null;
      const res = C.completeListening(state, D, { correct, total: turns.length }, new Date(), (Date.now() - started) / 60000);
      save();
      renderChrome('session');
      res.achievements.forEach((a) => toast(a.icon, `Achievement: ${a.title}`, a.desc));
      res.milestones.forEach((m) => toast('🏆', `Milestone: ${m.title}`, m.en));
      if (res.goalReachedNow) { toast('🎯', 'Objectif du jour atteint !', `Daily goal reached — ${C.currentStreak(state)}-day streak.`); confetti(); Sound.sfx('win'); }
      turnBox.innerHTML = `<div class="celebrate"><span class="celebrate-i">${correct === turns.length ? '🎉' : '🎭'}</span>
        <div><b>${correct} / ${turns.length} replies right first time · +${res.xp} XP</b><small>Next time, turn off “Show text” and follow ${esc(them)} by ear.</small></div></div>
        <div class="row center-row"><a class="btn secondary" href="#/roleplay/${u.id}">Play again</a><a class="btn primary" href="#/${after.route}/${u.id}">${after.label} →</a></div>`;
    }
    if (Speech.enabled()) Speech.load().catch(() => {});
    later(advance, 300);
  }
  // Plays one clip and resolves when it ends (or fails / is stopped).
  function playClip(id) {
    return new Promise((resolve) => {
      Sound.stop();
      const a = new Audio(`assets/audio/${id}.m4a`);
      a.playbackRate = state.settings.slowAudio ? 0.75 : 1;
      a.preservesPitch = true;
      Sound.current = a;
      // Missing clip: read the line with the browser's French voice instead.
      const fallback = () => {
        if (Sound.current !== a || !CLIP_TEXT[id] || !('speechSynthesis' in window)) return resolve();
        Sound.speak(CLIP_TEXT[id]);
        const wait = () => (speechSynthesis.speaking ? later(wait, 200) : resolve());
        later(wait, 300);
      };
      a.onended = a.onpause = () => resolve();
      a.onerror = fallback;
      a.play().catch((e) => (e && e.name === 'NotSupportedError' ? fallback() : resolve()));
    });
  }

  // ---------- practice sessions ----------
  let keyHandler = null;
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // menu shortcuts (Cmd+1…4, Cmd+R) are not answers
    const t = e.target instanceof Element ? e.target : document.body;
    if (t.matches('input[type=text], textarea') && e.key !== 'Enter') return;
    // Let focused links/buttons handle their own Enter/Space (except the main action buttons).
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('a, button, select, label') && !t.matches('#check, #continue, #next')) {
      if (!(e.key === 'Enter' && t.matches('.mic') && keyHandler)) return;
      e.preventDefault(); // Enter on the mic continues the exercise; Space/click records
    }
    if (keyHandler) keyHandler(e);
  });

  function startPractice(id) {
    const u = unitById(id);
    if (!u || !C.unitUnlocked(state, D, D.units.indexOf(u))) return go('#/');
    const cp = savedCheckpoint();
    if (cp && cp.kind === 'lesson' && cp.unit === u.id) {
      if (Speech.enabled()) Speech.load().catch(() => {});
      return runSession({ kind: 'lesson', unit: u, resume: cp });
    }
    const queue = C.buildLesson(D, u.id);
    if (Speech.enabled()) {
      // Two speaking steps per lesson: say a word, then shadow a whole sentence (repeat it right after Coco).
      // Practice only, never counted against your score.
      const [a, b] = C.shuffle(u.items).slice(0, 2);
      queue.splice(Math.min(3, queue.length), 0, { type: 'speak', item: a.id });
      queue.splice(Math.min(9, queue.length), 0, { type: 'shadow', item: b.id });
      Speech.load().catch(() => {}); // warm up the recognizer in the background
    }
    runSession({ kind: 'lesson', unit: u, queue });
  }
  function review(arg) {
    const cp = savedCheckpoint();
    if (arg === 'resume' && cp && cp.kind === 'review') return runSession({ kind: 'review', resume: cp });
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
    if (cp && cp.kind === 'review') { $('.review-hero').insertAdjacentHTML('beforebegin', resumeCard(cp)); bindResumeCard(); }
    const start = (ids) => runSession({ kind: 'review', queue: C.buildReview(D, ids) });
    if ($('#go-review')) $('#go-review').onclick = () => start(due.slice(0, 12));
    if ($('#go-weak')) $('#go-weak').onclick = () => start(C.weakestWords(state, 10));
  }

  // resume: a saved checkpoint to continue (remaining exercises, score so far, time spent).
  function runSession({ kind, unit, queue, resume }) {
    renderChrome('session');
    session = resume
      ? { kind, unit, queue: resume.queue.slice(), total: resume.total, done: resume.done, results: resume.results.slice(), started: Date.now() - resume.elapsed }
      : { kind, unit, queue: queue.slice(), total: queue.length, done: 0, results: [], started: Date.now() };
    if (resume && resume.queue.length) toast('⏯️', 'Picked up where you left off', `${resume.queue.length} exercise${resume.queue.length === 1 ? '' : 's'} to go`);
    nextExercise();
  }
  function closeHref() { return session.kind === 'lesson' ? `#/unit/${session.unit.id}` : '#/review'; }

  function nextExercise() {
    Speech.cancel();
    if (!session.queue.length) return finishSession();
    const ex = session.queue.shift();
    // Leaving now comes back to this exercise. Not before the first answer, so merely opening a
    // practice doesn't replace another one you left unfinished.
    if (session.done > 0) saveCheckpoint([ex].concat(session.queue));
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
    const renderers = { fill: exFill, speak: exSpeak, shadow: exSpeak, 'mc-fr-en': exMC, 'mc-en-fr': exMC, listen: exMC, type: exType, match: exMatch, order: exOrder,
      dictation: exDictation, gender: exGender, spot: exSpot, chunks: exChunks };
    renderers[ex.type](ex);
  }

  // Records the outcome, shows feedback and queues one retry for mistakes.
  function answered(ex, correct, info = {}) {
    if (!ex.retry) session.results.push({ item: ex.item || (ex.pairs && ex.pairs[0]) || ex.audio || `${ex.unit}-d${ex.drill + 1}`, type: ex.type, correct });
    if (!correct && !ex.retry && ex.type !== 'match') {
      session.queue.push(Object.assign({}, ex, { retry: true }));
      session.total++;
    }
    session.done++;
    saveCheckpoint(session.queue); // answered: leaving now comes back to the next one
    $('.progress i').style.width = `${(session.done / session.total) * 100}%`;
    Sound.sfx(correct ? 'good' : 'bad');
    const item = ex.item ? C.findItem(D, ex.item) : null;
    const fb = $('#fb');
    const title = correct ? pick(PRAISE) : pick(ENCOURAGE);
    let detail = '';
    if (info.hint) detail += `<p class="hint">${info.hint}</p>`;
    if (info.detail) detail += info.detail;
    const sentence = ex.type === 'order' || ex.type === 'dictation';
    if (item && sentence) detail += `<div class="fb-answer">${speakerBtn(item.id + '-ex')}<div><b lang="fr">${fr(item.ex.fr)}</b><small>${esc(item.ex.en)}</small></div></div>`;
    else if (item) detail += `<div class="fb-answer">${speakerBtn(item.id)}<div><b lang="fr">${fr(item.fr)}</b><small>${esc(item.en)}</small></div></div>`;
    fb.className = `feedback ${correct ? 'good' : 'bad'}`;
    fb.innerHTML = `<h3>${correct ? ICON.check : '✗'} ${title}</h3>${correct || info.hint ? '' : '<p class="hint">Correct answer:</p>'}${detail}`;
    fb.hidden = false;
    $('#foot').innerHTML = `<button class="btn ${correct ? 'primary' : 'danger'} wide" id="continue">Continue</button>`;
    $('#continue').onclick = nextExercise;
    $('#continue').focus({ preventScroll: true });
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); nextExercise(); } };
    if (info.audio && state.settings.autoplay) later(() => Sound.play(info.audio, itemText(info.audio)), 350);
    if (item && state.settings.autoplay) {
      later(() => (sentence ? Sound.play(item.id + '-ex', item.ex.fr) : Sound.play(item.id, item.fr)), 350);
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
    const mode = state.settings.typing;
    if (mode === 'off') {
      const mc = C.asChoice(D, ex);
      session.current = mc;
      return exMC(mc);
    }
    return mode === 'keyboard' ? exKeyboard(ex) : exTiles(ex);
  }
  function typeResult(ex, it, res) {
    const hint = res === 'accent' ? 'Watch the accents!' : res === 'article' ? 'Remember the article — it shows the gender.' : '';
    answered(ex, res !== 'wrong', { hint });
  }
  // Renders letter slots grouped per word (so a word never breaks across lines).
  // cell(i) returns [className, text] for the i-th fillable letter.
  function slotsHtml(word, cell) {
    let n = 0;
    return word.split(' ').map((w) => `<span class="wgroup">${C.letterSlots(w).map((sl) => {
      if (sl.given) return `<span class="given">${esc(sl.ch)}</span>`;
      const [cls, text] = cell(n++);
      return `<span class="${cls}">${esc(text)}</span>`;
    }).join('')}</span>`).join('');
  }
  // A guide like "n _ _" showing the word's length; revealed letters are filled in.
  function guideHtml(word, revealed) {
    const letters = C.letterSlots(word).filter((sl) => !sl.given).map((sl) => sl.ch);
    return `<div class="guide" lang="fr" aria-hidden="true">${slotsHtml(word, (i) => (i < revealed ? ['shown', letters[i]] : ['', '']))}</div>`;
  }
  const typeSwitch = (label, mode) => `<button type="button" class="link-btn" data-typing="${mode}">${label}</button>`;
  function bindTypeSwitch(ex) {
    $$('[data-typing]').forEach((b) => (b.onclick = () => {
      state.settings.typing = b.dataset.typing; save();
      toast('✓', b.dataset.typing === 'keyboard' ? 'Switched to keyboard typing' : 'Switched to letter tiles', 'Change any time in Settings');
      exType(ex);
    }));
  }

  // Easiest: tap shuffled letters to spell the word. Spaces and punctuation are given.
  function exTiles(ex) {
    const it = C.findItem(D, ex.item);
    const slots = C.letterSlots(it.fr);
    const letters = C.spellingTiles(it.fr);
    const need = letters.length;
    $('#ex').innerHTML = `
      <p class="instr">Spell it in French</p>
      <div class="prompt-pic">${imgHtml(it, 'lg')}<b>${esc(it.en)}</b>${speakerBtn(it.id, 'Hear the word')}</div>
      <div class="spell" id="spell" lang="fr" aria-label="Your spelling"></div>
      <div class="letters" id="letters" lang="fr">
        ${letters.map((ch, k) => `<button type="button" class="letter" data-k="${k}">${esc(ch)}</button>`).join('')}
        <button type="button" class="letter back-key" id="undo" aria-label="Remove last letter">⌫</button>
      </div>
      <p class="center small">${typeSwitch('Prefer the keyboard? Type instead', 'keyboard')}</p>`;
    const picked = []; // tile indexes in order
    const draw = () => {
      $('#spell').innerHTML = slotsHtml(it.fr, (i) => {
        const k = picked[i];
        return [`${k !== undefined ? 'filled' : ''} ${i === picked.length ? 'cur' : ''}`, k !== undefined ? letters[k] : ''];
      });
      $$('#letters .letter[data-k]').forEach((b) => b.classList.toggle('used', picked.includes(Number(b.dataset.k))));
      $('#check').disabled = picked.length < need;
    };
    const add = (k) => { if (picked.length < need && !picked.includes(k)) { picked.push(k); Sound.sfx('tap'); draw(); } };
    const undo = () => { if (picked.length) { picked.pop(); draw(); } };
    $$('#letters .letter[data-k]').forEach((b) => (b.onclick = () => add(Number(b.dataset.k))));
    $$('#letters .letter').forEach((b) => (b.onmousedown = (e) => e.preventDefault())); // keep focus off tiles so Enter checks
    $('#undo').onclick = undo;
    bindTypeSwitch(ex);
    let done = false;
    const check = () => {
      if (done || picked.length < need) return;
      done = true;
      let n = 0;
      const answer = slots.map((sl) => (sl.given ? sl.ch : letters[picked[n++]])).join('');
      $$('#letters button, [data-typing]').forEach((b) => (b.disabled = true));
      const res = C.checkAnswer(answer, it.fr);
      $('#spell').classList.add(res === 'wrong' ? 'wrong' : 'right');
      typeResult(ex, it, res);
    };
    $('#check').onclick = check;
    // Physical keyboard works too: a letter picks a matching tile, Backspace removes.
    keyHandler = (e) => {
      if (done) return;
      if (e.key === 'Enter') { e.preventDefault(); check(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const base = (c) => c.replace('œ', 'o').replace('æ', 'a').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const free = letters.map((ch, k) => k).filter((k) => !picked.includes(k));
      const k = free.find((k) => letters[k] === key) ?? free.find((k) => base(letters[k]) === key);
      if (k !== undefined) add(k);
    };
    draw();
    if (state.settings.autoplay) later(() => Sound.play(it.id, it.fr), 250);
  }

  // Keyboard typing with a length guide and a hint button that reveals one letter at a time.
  function exKeyboard(ex) {
    const it = C.findItem(D, ex.item);
    let revealed = 1;
    $('#ex').innerHTML = `
      <p class="instr">Write this in French</p>
      <div class="prompt-pic">${imgHtml(it, 'lg')}<b>${esc(it.en)}</b></div>
      <div id="guide">${guideHtml(it.fr, revealed)}</div>
      <input type="text" id="answer" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in French…" aria-label="Your answer in French">
      <div class="accents">${ACCENTS.map((a) => `<button type="button" data-ch="${a}">${a}</button>`).join('')}
        <button type="button" class="hint-btn" id="hint">💡 Hint</button></div>
      <p class="center small">${typeSwitch('Too hard? Use letter tiles', 'tiles')}</p>`;
    const input = $('#answer');
    input.focus();
    input.oninput = () => { $('#check').disabled = !input.value.trim(); };
    $$('.accents button').forEach((b) => (b.onmousedown = (e) => e.preventDefault()));
    $$('.accents button[data-ch]').forEach((b) => (b.onclick = () => {
      input.setRangeText(b.dataset.ch, input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
    // Hints stop one letter short, so the learner always finishes the word.
    const total = C.letterSlots(it.fr).filter((sl) => !sl.given).length;
    const maxReveal = Math.max(1, total - 1);
    if (revealed >= maxReveal) $('#hint').disabled = true;
    $('#hint').onclick = () => {
      revealed = Math.min(maxReveal, revealed + 1);
      $('#guide').innerHTML = guideHtml(it.fr, revealed);
      input.value = C.revealPrefix(it.fr, revealed);
      input.dispatchEvent(new Event('input'));
      input.focus();
      if (revealed >= maxReveal) $('#hint').disabled = true;
    };
    bindTypeSwitch(ex);
    const check = () => {
      if (!input.value.trim() || input.disabled) return;
      const res = C.checkAnswer(input.value, it.fr);
      input.disabled = true;
      $$('.accents button, [data-typing]').forEach((b) => (b.disabled = true));
      input.classList.add(res === 'wrong' ? 'wrong' : 'right');
      typeResult(ex, it, res);
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && (e.target === input || e.target === document.body)) { e.preventDefault(); check(); } };
  }

  function exFill(ex) {
    const u = unitById(ex.unit);
    const [q, answer, , en] = u.grammar.drills[ex.drill];
    const audio = `${u.id}-d${ex.drill + 1}`;
    const [before, afterTxt] = q.split('___');
    const sounds = u.kind === 'sounds'; // listen to the word, then choose the letters that spell its vowel
    $('#ex').innerHTML = `
      <p class="instr">${sounds ? 'Listen, then choose the spelling' : 'Complete the sentence'}</p>
      ${sounds ? `<div class="listen-row">${speakerBtn(audio, 'Play the word', 'huge')}<button class="speaker slow" data-audio="${audio}" data-slow="1" aria-label="Play slowly">${ICON.turtle}</button></div>` : ''}
      <div class="fill-sentence" lang="fr">${fr(before)}<span class="blank${sounds ? ' in-word' : ''}" id="blank">____</span>${fr(afterTxt)}</div>
      <p class="fill-en">${esc(en)}</p>
      <div class="options">${ex.options.map((o, k) => `<button class="option" data-o="${esc(o)}" lang="fr"><kbd>${k + 1}</kbd><span>${fr(o)}</span></button>`).join('')}</div>`;
    let chosen = null;
    const choose = (b) => {
      $$('.option').forEach((x) => x.classList.toggle('selected', x === b));
      chosen = b.dataset.o;
      $('#blank').textContent = chosen;
      $('#blank').classList.add('filled');
      $('#check').disabled = false;
      Sound.sfx('tap');
    };
    $$('.option').forEach((b) => (b.onclick = () => choose(b)));
    const check = () => {
      if (!chosen) return;
      const ok = chosen === answer;
      $$('.option').forEach((b) => { b.disabled = true; if (b.dataset.o === answer) b.classList.add('right'); else if (b.dataset.o === chosen) b.classList.add('wrong'); });
      $('#blank').textContent = answer;
      $('#blank').classList.add(ok ? 'right' : 'wrong');
      answered(ex, ok, { audio, detail: `<div class="fb-answer">${speakerBtn(audio)}<div><b lang="fr">${fr(C.drillSpeech([q, answer]))}</b><small>${esc(en)}</small></div></div>` });
    };
    $('#check').onclick = check;
    keyHandler = (e) => {
      const n = Number(e.key), opts = $$('.option');
      if (n >= 1 && n <= opts.length && !opts[n - 1].disabled) choose(opts[n - 1]);
      else if (e.key === 'Enter' && chosen) { e.preventDefault(); check(); }
    };
    if (sounds) later(() => Sound.play(audio, itemText(audio)), 250);
  }

  // 'speak': say a word. 'shadow': listen to the example sentence and repeat it straight after Coco,
  // copying the rhythm and linking (shadowing).
  function exSpeak(ex) {
    if (!Speech.enabled()) { session.done++; return nextExercise(); }
    const word = C.findItem(D, ex.item);
    const shadow = ex.type === 'shadow';
    const it = shadow ? { id: `${word.id}-ex`, fr: word.ex.fr, en: word.ex.en } : word;
    $('#ex').innerHTML = `
      <p class="instr">${shadow ? 'Shadowing: listen, then say the whole sentence' : 'Say it out loud'}</p>
      ${shadow ? '<p class="muted small why">Copy Coco\'s rhythm and how the words run together — say it right after listening.</p>' : ''}
      <div class="prompt-pic">${imgHtml(word, shadow ? 'md' : 'lg')}<div><b class="say-fr" lang="fr">${fr(it.fr)}</b><small class="muted">${esc(it.en)}</small></div>${speakerBtn(it.id, 'Hear Coco say it')}</div>
      ${speakWidget(it)}`;
    $('#foot').innerHTML = `<button class="btn secondary" id="skip">Skip</button><button class="btn primary" id="continue" disabled>Continue</button>`;
    const next = () => { session.done++; nextExercise(); };
    $('#skip').onclick = next;
    $('#continue').onclick = next;
    bindSpeak($('[data-speak]'), it, () => { $('#continue').disabled = false; });
    keyHandler = (e) => { if (e.key === 'Enter' && !$('#continue').disabled) { e.preventDefault(); next(); } };
    if (state.settings.autoplay || shadow) later(() => Sound.play(it.id, it.fr), 250);
  }

  function exMatch(ex) {
    const items = ex.pairs.map((id) => C.findItem(D, id));
    const left = C.shuffle(items), right = C.shuffle(items);
    $('#ex').innerHTML = `
      <p class="instr">${CLICK} the matching pairs</p>
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

  // Builds the example sentence from word tiles: from its English ('order') or from hearing it ('dictation').
  function exOrder(ex) {
    const it = C.findItem(D, ex.item);
    const target = C.tokenize(it.ex.fr);
    const listen = ex.type === 'dictation';
    $('#ex').innerHTML = `${listen ? `
      <p class="instr">Dictée: listen and build what you hear</p>
      ${dictationPrompt(it)}` : `
      <p class="instr">Build the sentence in French</p>
      <div class="prompt-pic small">${imgHtml(it, 'md')}<b>${esc(it.ex.en)}</b></div>`}
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
    if (listen && state.settings.autoplay) later(() => Sound.play(`${it.id}-ex`, it.ex.fr), 250);
  }

  // ---------- chunks ----------
  // Put groups of words in order ("Je voudrais" · "un café," · "s'il vous plaît.") — a step before
  // building a sentence word by word or writing it out.
  function exChunks(ex) {
    $('#ex').innerHTML = `
      <p class="instr">Put the pieces in order</p>
      <p class="muted small why">Capital letters and punctuation are clues to where each piece goes.</p>
      <div class="prompt-pic small"><b>${esc(ex.en)}</b>${speakerBtn(ex.audio, 'Hear the sentence')}</div>
      <div class="answer-line" id="line" lang="fr" aria-label="Your sentence"></div>
      <div class="bank" id="bank" lang="fr">${ex.chunks.map((c, k) => `<button class="word chunk" data-k="${k}"><kbd>${k + 1}</kbd><span>${fr(c)}</span></button>`).join('')}</div>`;
    const line = $('#line'), bank = $('#bank');
    const update = () => { $('#check').disabled = line.children.length < ex.chunks.length; };
    const add = (w) => {
      if (!w || w.disabled || w.classList.contains('used')) return;
      const c = document.createElement('button');
      c.className = 'word chunk';
      c.dataset.k = w.dataset.k;
      c.innerHTML = w.querySelector('span').innerHTML;
      c.onclick = () => { if (c.disabled) return; line.removeChild(c); w.classList.remove('used'); update(); };
      w.classList.add('used');
      line.appendChild(c);
      Sound.sfx('tap');
      update();
    };
    bank.onclick = (e) => add(e.target.closest('.word'));
    const check = () => {
      if (line.children.length < ex.chunks.length || line.classList.contains('right') || line.classList.contains('wrong')) return;
      const built = $$('.word', line).map((w) => ex.chunks[w.dataset.k]).join(' ');
      const ok = C.normalize(built) === C.normalize(ex.fr);
      $$('.word').forEach((w) => (w.disabled = true));
      line.classList.add(ok ? 'right' : 'wrong');
      answered(ex, ok, { audio: ex.audio, detail: `<div class="fb-answer">${speakerBtn(ex.audio)}<div><b lang="fr">${fr(ex.fr)}</b><small>${esc(ex.en)}</small></div></div>` });
    };
    $('#check').onclick = check;
    // Number keys pick a piece, Backspace takes the last one back, Enter checks.
    keyHandler = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ex.chunks.length) add($(`#bank .word[data-k="${n - 1}"]`));
      else if (e.key === 'Backspace' && line.lastElementChild) { e.preventDefault(); line.lastElementChild.click(); }
      else if (e.key === 'Enter') { e.preventDefault(); check(); }
    };
  }

  // ---------- dictation (dictée) ----------
  const dictationPrompt = (it) => `
      <div class="listen-row">${speakerBtn(`${it.id}-ex`, 'Play the sentence', 'huge')}<button class="speaker slow" data-audio="${it.id}-ex" data-slow="1" aria-label="Play slowly">${ICON.turtle}</button></div>`;
  // Listen to an example sentence and write it down. With letter tiles (or typing off) it is built from
  // word tiles; with the keyboard it is typed, and each word is marked right, accent-only or missing.
  function exDictation(ex) {
    const it = C.findItem(D, ex.item);
    if (state.settings.typing !== 'keyboard') {
      ex.tiles = ex.tiles || C.shuffle(C.tokenize(it.ex.fr));
      return exOrder(ex);
    }
    $('#ex').innerHTML = `
      <p class="instr">Dictée: write what you hear</p>
      <p class="muted small why">Capitals and punctuation don't count; accents do.</p>
      ${dictationPrompt(it)}
      <input type="text" id="answer" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Écrivez la phrase…" aria-label="The sentence you heard">
      <div class="accents">${ACCENTS.map((a) => `<button type="button" data-ch="${a}">${a}</button>`).join('')}</div>`;
    const input = $('#answer');
    input.focus();
    input.oninput = () => { $('#check').disabled = !input.value.trim(); };
    $$('.accents button').forEach((b) => (b.onmousedown = (e) => e.preventDefault()));
    $$('.accents button[data-ch]').forEach((b) => (b.onclick = () => {
      input.setRangeText(b.dataset.ch, input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
    const check = () => {
      if (!input.value.trim() || input.disabled) return;
      const res = C.checkDictation(input.value, it.ex.fr);
      input.disabled = true;
      $$('.accents button').forEach((b) => (b.disabled = true));
      input.classList.add(res.result === 'wrong' ? 'wrong' : 'right');
      const marks = `<p class="dict-marks" lang="fr">${res.words.map((w) => `<span class="${w.mark}">${fr(w.w)}</span>`).join(' ')}</p>`;
      const hint = res.result === 'accent' ? 'Right words — watch the accents!' : res.result === 'wrong' ? 'Underlined words were missing or misspelled:' : '';
      answered(ex, res.result !== 'wrong', { hint, detail: res.result === 'exact' ? '' : marks });
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && (e.target === input || e.target === document.body)) { e.preventDefault(); check(); } };
    if (state.settings.autoplay) later(() => Sound.play(`${it.id}-ex`, it.ex.fr), 250);
  }

  // ---------- le or la? (noun gender) ----------
  // Four nouns without their article; choose le or la for each. Colours stay the same everywhere
  // (blue = masculine, red = feminine) so gender is remembered as part of the word.
  function exGender(ex) {
    const items = ex.pairs.map((id) => C.findItem(D, id));
    const choice = {};
    $('#ex').innerHTML = `
      <p class="instr">Le or la?</p>
      <p class="muted small why">Learn each noun with its gender — « l' » hides it, so those count too.</p>
      <ol class="gender-list">${items.map((it) => `
        <li data-id="${it.id}">${imgHtml(it, 'xs')}<b lang="fr">${fr(C.bareNoun(it.fr))}</b><small>${esc(it.en.replace(/^the /, ''))}</small>
          <span class="gender-btns"><button type="button" class="g-btn g-m" data-g="m" lang="fr">le</button><button type="button" class="g-btn g-f" data-g="f" lang="fr">la</button></span></li>`).join('')}</ol>`;
    $$('.g-btn').forEach((b) => (b.onmousedown = (e) => e.preventDefault())); // keep focus off, so Enter checks
    $$('.gender-list li').forEach((li) => $$('.g-btn', li).forEach((b) => (b.onclick = () => {
      if (b.disabled) return;
      choice[li.dataset.id] = b.dataset.g;
      $$('.g-btn', li).forEach((x) => x.classList.toggle('selected', x === b));
      Sound.sfx('tap');
      $('#check').disabled = Object.keys(choice).length < items.length;
    })));
    const check = () => {
      if (Object.keys(choice).length < items.length || $('.g-btn:disabled')) return;
      let right = 0;
      for (const li of $$('.gender-list li')) {
        const g = C.genderOf(C.findItem(D, li.dataset.id));
        const ok = choice[li.dataset.id] === g;
        if (ok) right++;
        li.classList.add(ok ? 'right' : 'wrong');
        $$('.g-btn', li).forEach((b) => { b.disabled = true; if (b.dataset.g === g) b.classList.add('answer'); });
      }
      const list = `<ul class="gender-answers" lang="fr">${items.map((it) => `<li class="g-${C.genderOf(it)}">${speakerBtn(it.id)}<b>${fr(it.fr)}</b><small lang="en">${C.genderOf(it) === 'm' ? 'masculine · un' : 'feminine · une'}</small></li>`).join('')}</ul>`;
      answered(ex, right === items.length, { hint: right === items.length ? '' : `${right} of ${items.length} right. Say them with their article:`, detail: list });
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && !$('#check').disabled) { e.preventDefault(); check(); } };
  }

  // ---------- find the mistake ----------
  // A drill sentence with one wrong form; spot it, then see the corrected sentence (noticing).
  function exSpot(ex) {
    const u = unitById(ex.unit);
    const drill = u.grammar.drills[ex.drill];
    const [q, answer, , en] = drill;
    const audio = `${u.id}-d${ex.drill + 1}`;
    const segs = C.spotSegments(drill, ex.wrong);
    $('#ex').innerHTML = `
      <p class="instr">Find the mistake</p>
      <p class="muted small why">One word is wrong. ${CLICK} it.</p>
      <div class="spot-sentence" lang="fr">${segs.map((sg, k) => (sg.punct ? `<span class="spot-punct">${esc(sg.text)}</span>` : `<button type="button" class="spot-word" data-k="${k}">${fr(sg.text)}</button>`)).join(' ')}</div>
      <p class="fill-en">${esc(en)}</p>`;
    let chosen = null;
    $$('.spot-word').forEach((b) => (b.onmousedown = (e) => e.preventDefault())); // keep focus off, so Enter checks
    $$('.spot-word').forEach((b) => (b.onclick = () => {
      if (b.disabled) return;
      chosen = Number(b.dataset.k);
      $$('.spot-word').forEach((x) => x.classList.toggle('selected', x === b));
      $('#check').disabled = false;
      Sound.sfx('tap');
    }));
    const check = () => {
      if (chosen === null || $('.spot-word:disabled')) return;
      const k = segs.findIndex((sg) => sg.wrong);
      const ok = chosen === k;
      $$('.spot-word').forEach((b) => { const n = Number(b.dataset.k); b.disabled = true; if (n === k) b.classList.add('wrong-form'); else if (n === chosen) b.classList.add('wrong'); });
      $(`.spot-word[data-k="${k}"]`).innerHTML = `<s>${fr(ex.wrong)}</s> ${fr(answer)}`;
      answered(ex, ok, { audio, hint: ok ? `« ${esc(ex.wrong)} » → « ${esc(answer)} »` : `The mistake was « ${esc(ex.wrong)} » — it should be « ${esc(answer)} ».`,
        detail: `<div class="fb-answer">${speakerBtn(audio)}<div><b lang="fr">${fr(C.drillSpeech([q, answer]))}</b><small>${esc(en)}</small></div></div>` });
    };
    $('#check').onclick = check;
    keyHandler = (e) => { if (e.key === 'Enter' && chosen !== null) { e.preventDefault(); check(); } };
  }

  function finishSession() {
    clearCheckpoint();
    const s = session;
    const minutes = (Date.now() - s.started) / 60000;
    const res = s.kind === 'lesson'
      ? C.completeLesson(state, D, s.unit.id, s.results, new Date(), minutes)
      : C.completeReview(state, D, s.results, new Date(), minutes);
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
  function studyTime() {
    const mins = Object.values(state.daily).reduce((a, d) => a + (d.minutes || 0), 0);
    return mins < 60 ? `${Math.round(mins)} min` : `${Math.floor(mins / 60)} h ${Math.round(mins % 60)}`;
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
        <div class="card stat"><span>⏱️</span><b>${studyTime()}</b><small>Study time</small></div>
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
        ${toggle('speaking', 'Speaking practice', Speech.available()
          ? 'Say words aloud; Coco checks your pronunciation offline'
          : 'Needs the microphone — open the app with start.command to use it')}
        <label class="setting"><div><b>Writing exercises</b><small>How you spell French words</small></div>
          <select id="typing">${[['tiles', 'Letter tiles (easiest)'], ['keyboard', 'Keyboard + hints'], ['off', 'Off — choose instead']].map(([v, l]) => `<option value="${v}" ${s.typing === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
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
    $('#typing').onchange = (e) => { s.typing = e.target.value; save(); toast('✓', 'Writing exercises updated'); };
    $('#export').onclick = () => {
      // The Android app can't download blob: links, so it saves the file itself (system "Save to" picker).
      if (window.CocoAndroid) return window.CocoAndroid.saveFile(`french-progress-${today()}.json`, JSON.stringify(state, null, 2));
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
        state = C.migrate(data); save(); clearCheckpoint(); applyTheme(); toast('✓', 'Backup imported'); settings();
      } catch (err) { toast('⚠️', 'Import failed', 'That file is not a valid backup.'); }
    };
    $('#reset').onclick = () => {
      if (!confirm('Erase all progress, streaks and achievements? This cannot be undone (export a backup first if unsure).')) return;
      state = C.defaultState(); save(); clearCheckpoint(); applyTheme(); toast('↺', 'Progress reset'); go('#/');
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
  // Load the speech model shortly after start-up, so the first pronunciation check is fast. Not on phones and
  // tablets: there it would hold ~200 MB of memory from launch, so speaking screens warm it up instead.
  if (Speech.enabled() && !TOUCH) setTimeout(() => Speech.load().catch(() => {}), 1500);
})();
