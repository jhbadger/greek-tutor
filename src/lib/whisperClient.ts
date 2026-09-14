// Talks to a locally-running whisper.cpp `whisper-server` (see whisper/README.md).
// The server's exact response shape can drift between whisper.cpp versions --
// if transcribe() throws or returns empty text unexpectedly, check the raw
// response with:
//   curl -F file=@test.wav http://127.0.0.1:8081/inference
// and adjust the parsing below to match.

const STORAGE_KEY = 'greek-practice:whisper-url';
const DEFAULT_URL = 'http://127.0.0.1:8081';

export function getWhisperUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_URL;
}

export function setWhisperUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''));
}

export async function transcribe(wavBlob: Blob): Promise<string> {
  const base = getWhisperUrl();
  const form = new FormData();
  form.append('file', wavBlob, 'audio.wav');
  form.append('response_format', 'json');
  form.append('language', 'el');

  const res = await fetch(`${base}/inference`, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Whisper server error (${res.status}). Check it's running and the URL in Settings.`);
  }
  const data = await res.json();
  const text: unknown = data.text ?? data.transcription;
  if (typeof text === 'string') return text.trim();
  if (Array.isArray(text)) {
    return text
      .map((seg) => (typeof seg === 'string' ? seg : (seg as { text?: string })?.text ?? ''))
      .join(' ')
      .trim();
  }
  return '';
}
