// Wraps the browser's built-in SpeechRecognition (Web Speech API). Unlike
// whisper.cpp this needs no local server -- but it sends audio to the
// browser vendor's cloud speech service, so it's not local/offline. Used as
// the default STT backend on Android, where a local whisper-server on
// another machine usually isn't reachable.

interface MinimalSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechAvailable(): boolean {
  return getCtor() !== null;
}

export class WebSpeechRecognizer {
  private recognition: MinimalSpeechRecognition | null = null;
  private result: Promise<string> | null = null;

  start(): void {
    const Ctor = getCtor();
    if (!Ctor) throw new Error('Speech recognition is not supported in this browser.');

    const recognition = new Ctor();
    recognition.lang = 'el-GR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    this.result = new Promise<string>((resolve, reject) => {
      recognition.addEventListener('result', (e: any) => {
        finalTranscript = Array.from(e.results as ArrayLike<any>)
          .map((r: any) => r[0]?.transcript ?? '')
          .join(' ');
      });
      recognition.addEventListener('error', (e: any) => {
        reject(new Error(`Speech recognition error: ${e.error ?? 'unknown'}`));
      });
      recognition.addEventListener('end', () => resolve(finalTranscript.trim()));
    });

    recognition.start();
    this.recognition = recognition;
  }

  // Web Speech API recognizers can end on their own (e.g. after a pause,
  // since continuous is off) before the user taps Stop -- calling stop() on
  // an already-ended recognizer is a documented no-op, not an error.
  async stop(): Promise<string> {
    if (!this.recognition || !this.result) throw new Error('Speech recognition was not started.');
    this.recognition.stop();
    return this.result;
  }
}
