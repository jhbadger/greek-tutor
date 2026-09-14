let pendingVoices: Promise<SpeechSynthesisVoice[]> | null = null;

// getVoices() can legitimately return [] before the browser has finished
// loading its voice list. Never cache that empty result -- only memoize the
// *pending* lookup, and always re-check synchronously first so a session
// that races the load doesn't lose the Greek voice for good.
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const existing = speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  if (!pendingVoices) {
    pendingVoices = new Promise((resolve) => {
      const finish = () => {
        speechSynthesis.removeEventListener('voiceschanged', finish);
        const voices = speechSynthesis.getVoices();
        pendingVoices = null;
        resolve(voices);
      };
      speechSynthesis.addEventListener('voiceschanged', finish);
      // Some engines populate the list without ever firing voiceschanged.
      setTimeout(finish, 1000);
    });
  }
  return pendingVoices;
}

export async function greekVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith('el')) ?? null;
}

export async function hasGreekVoice(): Promise<boolean> {
  return (await greekVoice()) !== null;
}

export async function speak(text: string): Promise<void> {
  const voice = await greekVoice();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = 'el-GR';
    }
    utter.rate = 0.9;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}
