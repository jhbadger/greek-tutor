#!/usr/bin/env bash
# Launches the local whisper.cpp server used for speech recognition.
# One-time setup: see whisper/README.md.
set -euo pipefail

MODEL="${WHISPER_MODEL:-$HOME/.cache/whisper.cpp/ggml-small.bin}"
HOST="${WHISPER_HOST:-127.0.0.1}"
PORT="${WHISPER_PORT:-8081}"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server not found. Install it with: brew install whisper.cpp" >&2
  exit 1
fi

if [ ! -f "$MODEL" ]; then
  echo "Model not found at $MODEL" >&2
  echo "Download one first, e.g.:" >&2
  echo "  mkdir -p \"$(dirname "$MODEL")\"" >&2
  echo "  curl -L -o \"$MODEL\" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" >&2
  exit 1
fi

echo "Starting whisper-server on http://$HOST:$PORT with model $MODEL"
exec whisper-server --model "$MODEL" --host "$HOST" --port "$PORT" --language el
