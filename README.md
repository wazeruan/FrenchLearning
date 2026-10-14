# Coco · French

A private, offline French course that takes you from zero toward **NCLC 7** on TEF Canada / TCF Canada
(Canadian immigration), about 30 minutes a day. No account, no tracking, no network: everything —
lessons, audio, images and your progress — lives on this machine. See [ROADMAP.md](ROADMAP.md) for the
stages and the plan.

## Open the app

- **Mac app (recommended):** open **Coco French** from Applications / Launchpad. It is a native window
  with everything inside it (lessons, audio, offline speech model). Build or update it with
  `./scripts/build-mac-app.sh --install` (needs Xcode Command Line Tools).
- **In a browser:** double-click `start.command` (serves the folder on `127.0.0.1:8642`, this machine
  only), or open `index.html` directly — everything except speaking practice works that way.

Each way of opening keeps its own progress. To move progress, use **Settings → Export backup** in one
and **Import backup** in the other.

Progress is saved in the browser's local storage, which is tied to the address you open the app from.
Pick one way and stick with it, or use **Settings → Export backup / Import backup** to move progress.

## What's inside

- **Stage 1 · A1 (≈ NCLC 1–3), 25 units:** 12 vocabulary units, 10 grammar lessons (être, articles,
  adjectives, avoir and possessives, -er verbs, negation, questions, aller/faire, numbers to 100,
  telling time) and 3 Canadian-life dialogues (airport, grocery store, booking a clinic appointment).
- **Each unit is a guided sequence:** words → grammar lesson or dialogue → practice.
- **Seven exercise types:** meaning (FR→EN), translation (EN→FR), listening, spelling (letter tiles,
  keyboard with hints, or off), matching pairs, sentence building, and grammar fill-in-the-blank.
  Mistakes come back once at the end of the lesson.
- **Dialogues** voiced by a Canadian (Amélie, fr_CA) and a French (Thomas) voice: listen first with the
  text blurred, answer comprehension questions, then read along.
- **"Today's 30 minutes":** review (~5 min), the next lesson (~15 min), and a listening or speaking drill
  (~10 min), with study time tracked.
- **Daily review** with spaced repetition (Leitner boxes: 1, 2, 4, 8, 16 days).
- **Motivation:** daily XP goal, day streaks, a weekly strip and activity heatmap, 10 levels, path
  milestones and 24 achievements.
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
macos/              the native Mac app (Swift: window + built-in localhost server)
scripts/            generators for audio and art, speech setup, local server, build-mac-app.sh
models/, vendor/    speech model + runtime (downloaded by setup-speech.sh, not in git)
tests/              node:test unit tests for core.js
```

## Maintenance

```bash
node --test                              # run unit tests
node scripts/generate-audio.mjs          # create/refresh audio (macOS `say`: Thomas + Amélie fr_CA);
                                         # assets/audio/manifest.json tracks text, so edited lines are redone
node scripts/generate-audio.mjs --force  # regenerate all audio
node scripts/generate-art.mjs            # redraw SVG illustrations
```

To add content, edit `js/data.js` (units, grammar `sections`/`drills`, dialogue `lines`/`questions`; ids
must be unique and never change, since they key saved progress), add the unit id to a stage's `units`
list, then run the audio script.
To use your own recordings, drop `<id>.m4a` / `<id>-ex.m4a` files into `assets/audio/` (same names) —
if a file is missing the app falls back to the browser's built-in French voice.
