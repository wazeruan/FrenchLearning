# Coco · French

A private, offline French course for beginners (A1). No account, no tracking, no network:
everything — lessons, audio, images and your progress — lives on this machine.

## Open the app

- **Easiest:** double-click `start.command`. It serves the folder on `127.0.0.1:8642` and opens your browser.
- Or open `index.html` directly in Chrome/Edge/Firefox/Safari.

Progress is saved in the browser's local storage, which is tied to the address you open the app from.
Pick one way and stick with it, or use **Settings → Export backup / Import backup** to move progress.

## What's inside

- **12 units, 104 words**, each with an illustration, pronunciation, an example sentence and a grammar tip.
- **Six exercise types:** meaning (FR→EN), translation (EN→FR), listening, typing (with an accent keyboard),
  matching pairs, and sentence building. Mistakes come back once at the end of the lesson.
- **Daily review** with spaced repetition (Leitner boxes: 1, 2, 4, 8, 16 days).
- **Motivation:** daily XP goal, day streaks, a weekly strip and activity heatmap, 10 levels,
  4 path milestones and 23 achievements.
- Light/dark themes, keyboard shortcuts (1–4 to choose, Enter to check/continue, ← → on flashcards).

## Project layout

```
index.html          app shell
css/styles.css      design tokens + layout (light & dark)
js/data.js          course content (edit here to add words/units)
js/core.js          pure logic: XP, streaks, spaced repetition, exercises, achievements
js/app.js           UI, routing, audio, celebrations
assets/audio/       <id>.m4a (word) and <id>-ex.m4a (example sentence)
assets/img/         mascot and unit cover illustrations (SVG)
scripts/            generators for audio and art
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
