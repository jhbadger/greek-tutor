// Unifies the two STT backends behind one start()/stop() session so UI code
// doesn't need to branch.
//
// The webspeech backend does NOT also open a Recorder/getUserMedia stream
// alongside it: on Android, only one audio-capture session can hold the mic
// at the OS level, so a parallel getUserMedia stream starves the browser's
// native SpeechRecognition of audio -- it then ends silently with an empty
// transcript rather than an error. That means no "Hear yourself" playback
// for webspeech attempts (SttResult.audioBlob is only set for whisper).
import { Recorder, toWav16kMono } from './stt';
import { transcribe as transcribeWhisper } from './whisperClient';
import { WebSpeechRecognizer } from './webSpeechClient';
import { getSttBackend } from './sttBackend';

export interface SttResult {
  transcript: string;
  audioBlob?: Blob;
  recordedSec?: number;
}

export class SttSession {
  private recorder = new Recorder();
  private webSpeech: WebSpeechRecognizer | null = null;

  async start(): Promise<void> {
    if (getSttBackend() === 'webspeech') {
      this.webSpeech = new WebSpeechRecognizer();
      this.webSpeech.start();
    } else {
      await this.recorder.start();
    }
  }

  async stop(): Promise<SttResult> {
    if (this.webSpeech) {
      const transcript = await this.webSpeech.stop();
      this.webSpeech = null;
      return { transcript };
    }
    const blob = await this.recorder.stop();
    const audioBlob = await toWav16kMono(blob);
    const recordedSec = (audioBlob.size - 44) / (16000 * 2);
    const transcript = await transcribeWhisper(audioBlob);
    return { transcript, audioBlob, recordedSec };
  }

  release(): void {
    this.recorder.release();
  }
}
