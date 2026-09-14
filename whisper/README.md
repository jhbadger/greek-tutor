# Local speech recognition (whisper.cpp)

The app's "Record" buttons send audio to a local `whisper-server` process for
transcription. It runs entirely on your machine — no cloud API, no per-use cost.

## One-time setup

1. Install whisper.cpp:

   ```sh
   brew install whisper.cpp
   ```

2. Download a **multilingual** model (not an `.en`-suffixed one — those can't
   transcribe Greek). `small` is a good accuracy/speed balance for a laptop;
   `base` is faster but less accurate, `medium` is slower but more accurate.

   ```sh
   mkdir -p ~/.cache/whisper.cpp
   curl -L -o ~/.cache/whisper.cpp/ggml-small.bin \
     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
   ```

3. Confirm the binary name and flags installed on your machine — these have
   drifted between whisper.cpp versions:

   ```sh
   whisper-server --help
   ```

   If the binary isn't called `whisper-server`, or a flag name differs, update
   `scripts/start-whisper-server.sh` to match.

## Running it

```sh
npm run parse-epub    # if you haven't already generated src/data/lessons.json
./scripts/start-whisper-server.sh
```

This starts the server on `http://127.0.0.1:8081` by default. Leave it running
in a terminal while you use the app (similar to running Ollama locally) — the
app's Settings screen lets you change the URL if your port differs.

### Sanity-check it directly

Before wiring up the UI, confirm the server responds:

```sh
curl -F file=@/path/to/test.wav http://127.0.0.1:8081/inference
```

Should return JSON containing a `text` field with the transcription. If the
field name or response shape differs on your installed version, adjust the
parsing in `src/lib/whisperClient.ts`.
