# Coco · French

A private, offline French course for beginners (A1). No account, no tracking, no network:
everything — lessons, audio, images and your progress — lives on this machine.

## Open the app

- **Easiest:** double-click `start.command`. It serves the folder on `127.0.0.1:8642` (this machine only)
  and opens your browser.
- Or open `index.html` directly in Chrome/Edge/Firefox/Safari — everything except speaking practice works.

Progress is saved in the browser's local storage, which is tied to the address you open the app from.
Pick one way and stick with it, or use **Settings → Export backup / Import backup** to move progress.

## What's inside

- **12 units, 104 words**, each with an illustration, pronunciation, an example sentence and a grammar tip.
- **Six exercise types:** meaning (FR→EN), translation (EN→FR), listening, typing (with an accent keyboard),
  matching pairs, and sentence building. Mistakes come back once at the end of the lesson.
- **Daily review** with spaced repetition (Leitner boxes: 1, 2, 4, 8, 16 days).
- **Motivation:** daily XP goal, day streaks, a weekly strip and activity heatmap, 10 levels,
  4 path milestones and 23 achievements.
- **Speaking practice** 🎤: say a word and Coco checks your pronunciation — on flashcards and as
  "Say it out loud" steps in lessons (practice only, never lowers your stars). See below.
- Light/dark themes, keyboard shortcuts (1–4 to choose, Enter to check/continue, ← → on flashcards).

## Speaking practice (offline)

Your recording is recognized **on this computer** by OpenAI's Whisper (base) model running in the browser
via [transformers.js](https://github.com/huggingface/transformers.js); nothing is uploaded. The app compares
what it heard with the target word by spelling *and* by French sound (so *vert* / *verre* both count) and
shows a score, what it heard, and buttons to replay your voice next to Coco's.

- One-time setup (~160 MB, pinned versions): `./scripts/setup-speech.sh`
- Requires opening the app via `start.command` (microphone access needs `http://127.0.0.1`).
- Uses the GPU through WebGPU when available (≈0.6 s per word on an Apple-silicon Mac); otherwise falls
  back to the CPU (≈10 s per word).
- It judges whether a speech recognizer understood the word — a good proxy for intelligibility, not a
  detailed accent analysis. Turn it off in **Settings → Speaking practice**.

## Project layout

```
index.html          app shell
css/styles.css      design tokens + layout (light & dark)
js/data.js          course content (edit here to add words/units)
js/core.js          pure logic: XP, streaks, spaced repetition, exercises, achievements
js/app.js           UI, routing, audio, recording, celebrations
js/asr-worker.js    offline speech recognition (Whisper via transformers.js) in a Web Worker
assets/audio/       <id>.m4a (word) and <id>-ex.m4a (example sentence)
assets/img/         mascot and unit cover illustrations (SVG)
scripts/            generators for audio and art, speech setup, local server
models/, vendor/    speech model + runtime (downloaded by setup-speech.sh, not in git)
tests/              node:test unit tests for core.js
```

## Maintenance

```bash
node --test                              # run unit tests
node scripts/generate-audio.mjs          # create audio for new items (macOS `say`, voice "Thomas")
node scripts/generate-audio.mjs --force  # regenerate all audio
node scripts/generate-art.mjs            # redraw SVG illustrations
```

To add content, append items to a unit in `js/data.js` (ids must be unique), then run the audio script.
To use your own recordings, drop `<id>.m4a` / `<id>-ex.m4a` files into `assets/audio/` (same names) —
if a file is missing the app falls back to the browser's built-in French voice.
