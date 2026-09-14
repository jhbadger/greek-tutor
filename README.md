# Greek Practice

An installable PWA for practicing modern Greek, built from the lessons in
*Complete Greek: Teach Yourself* (Matsukas). Vocab flashcards and dialogue
read-throughs, with speech synthesis (browser TTS) to hear things pronounced
and speech recognition (a local whisper.cpp server) to check your own
pronunciation.

Everything runs locally — no cloud speech API, no account, no per-use cost.

## Setup

```sh
npm install
npm run parse-epub   # only needed once, or after re-running against a new epub
npm run make-icons   # only needed once, regenerates public/icons/
```

`parse-epub` reads `~/Downloads/greek.epub` and writes `src/data/lessons.json`
(already generated and checked in — the epub itself is never read at runtime).

### Speech recognition (whisper.cpp)

The Record buttons need a local `whisper-server` process. One-time setup:

```sh
brew install whisper.cpp
mkdir -p ~/.cache/whisper.cpp
curl -L -o ~/.cache/whisper.cpp/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

Then, each time you want to practice:

```sh
./scripts/start-whisper-server.sh
```

This starts the server on `http://127.0.0.1:8081` and leaves it running in
the terminal (similar to running Ollama locally). Full details, including how
to point the app at a different port, are in `whisper/README.md`.

### Speech synthesis

Uses the browser's native `speechSynthesis` with whatever Greek (`el-*`)
voice is installed at the OS level — nothing to configure, but the Settings
screen will tell you if none is found (macOS ships one, "Melina," by
default).

## Running it

```sh
npm run dev       # http://localhost:5173 -- no service worker, always fresh, best while developing
npm run build      # production build to dist/
npm run preview    # serve the production build, service worker included
```

Use `dev` while iterating — the built/`preview` version registers a
cache-first service worker (see **Offline / PWA behavior** below), which is
correct for real use but means a plain reload won't always show your latest
changes.

## Project structure

```
scripts/
  parse-epub.mjs            epub -> src/data/lessons.json (run manually)
  make-icons.mjs             generates public/icons/*.png
  start-whisper-server.sh    launches the local whisper-server
whisper/
  README.md                  whisper.cpp setup details
src/
  data/
    types.ts                 Chapter / Section / DialogueTurn / VocabEntry
    lessons.json              generated lesson content
  lib/
    tts.ts                    speechSynthesis wrapper, Greek voice selection
    stt.ts                    mic capture, resample to 16kHz mono WAV, mic device picker
    whisperClient.ts           talks to whisper-server's /inference endpoint
    textMatch.ts                diacritic-insensitive fuzzy Greek text matching
    progress.ts                  per-vocab-item correct/incorrect history (IndexedDB)
  ui/
    lessonList.ts, chapter.ts, vocabPractice.ts, dialoguePractice.ts, settings.ts
  main.ts                     hash router + entry point
  sw.ts                       custom service worker (cache-first, injectManifest)
  registerSW.ts                 service worker registration + update banner
  styles.css
```

## How practice works

- **Vocab flashcards**: pick a chapter (or one section within it) to get a
  shuffled queue of its vocab. Listen, reveal the English, or record
  yourself saying the Greek word — a wrong attempt gets requeued once later
  in the session. Progress per word is stored locally.
- **Dialogue practice**: pick which speaker's lines are "yours." The app
  plays the other role's lines via TTS and asks you to record yours,
  scoring against the actual dialogue line.

Recognition scoring is fuzzy (Levenshtein similarity after stripping accents
and punctuation) since exact-string matching against a real transcription
isn't realistic.

## Offline / PWA behavior

The built app follows a cache-first strategy: it precaches everything it
needs to launch (including `lessons.json`) and serves navigations from cache
immediately, checking for updates in the background. If you edit anything in
`src/` or `index.html`, rebuild, and reload an already-open tab, you may see
a small "New version available" banner rather than the change appearing
immediately — that's expected; tap it to refresh. To force a completely
clean state during development, run this in the browser console:

```js
(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister())
;(await caches.keys()).forEach(k => caches.delete(k))
```

## Troubleshooting

- **"Failed to fetch" when recording**: the whisper-server isn't running —
  start it with `./scripts/start-whisper-server.sh`.
- **Transcription is nonsense / always the same odd phrase (e.g. "[Applause]")**:
  classic Whisper response to silence. Go to Settings → Microphone and
  explicitly pick your input device (don't rely on "System default",
  especially with Bluetooth headsets), then use "Test microphone" there to
  confirm you can hear yourself before going back into a lesson.
- **First moment of a recording gets clipped**: the mic stream is kept open
  for an entire practice session specifically to avoid this (re-opening a
  Bluetooth mic on every take forces it to renegotiate its connection
  profile each time, which eats the first fraction of a second). This
  should only be noticeable, if at all, on the very first recording of a
  session.
- **No sound from Listen buttons**: Settings screen reports whether a Greek
  TTS voice was found; if not, install one in the OS's system settings.
