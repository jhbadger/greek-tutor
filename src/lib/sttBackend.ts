import { webSpeechAvailable } from './webSpeechClient';

export type SttBackend = 'whisper' | 'webspeech';

const KEY = 'greek-practice:stt-backend';

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

// Explicit user choice from Settings, if any ('auto' clears it).
export function getSttBackendOverride(): SttBackend | null {
  const stored = localStorage.getItem(KEY);
  return stored === 'whisper' || stored === 'webspeech' ? stored : null;
}

export function setSttBackend(backend: SttBackend | 'auto'): void {
  if (backend === 'auto') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, backend);
}

// Android can't usually reach a whisper-server running on your dev machine
// (127.0.0.1 there isn't 127.0.0.1 on the phone), so default to the
// browser's built-in cloud recognizer there; everywhere else, default to
// the local whisper.cpp server.
export function getSttBackend(): SttBackend {
  return getSttBackendOverride() ?? (isAndroid() && webSpeechAvailable() ? 'webspeech' : 'whisper');
}
