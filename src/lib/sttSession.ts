// Unifies the two STT backends behind one start()/stop() session so UI code
// doesn't need to branch. Both backends still capture audio via Recorder
// (needed for the "Hear yourself" playback either way); only where the
// transcript comes from differs.
import { Recorder, toWav16kMono } from './stt';
import { transcribe as transcribeWhisper } from './whisperClient';
import { WebSpeechRecognizer } from './webSpeechClient';
import { getSttBackend } from './sttBackend';

export interface SttResult {
  transcript: string;
  audioBlob: Blob;
  recordedSec: number;
}

export class SttSession {
  private recorder = new Recorder();
  private webSpeech: WebSpeechRecognizer | null = null;

  async start(): Promise<void> {
    await this.recorder.start();
    if (getSttBackend() === 'webspeech') {
      this.webSpeech = new WebSpeechRecognizer();
      this.webSpeech.start();
    }
  }

  async stop(): Promise<SttResult> {
    const blob = await this.recorder.stop();
    const audioBlob = await toWav16kMono(blob);
    const recordedSec = (audioBlob.size - 44) / (16000 * 2);
    const transcript = this.webSpeech ? await this.webSpeech.stop() : await transcribeWhisper(audioBlob);
    this.webSpeech = null;
    return { transcript, audioBlob, recordedSec };
  }

  release(): void {
    this.recorder.release();
  }
}
