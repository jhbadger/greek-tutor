const MIC_DEVICE_KEY = 'greek-practice:mic-device-id';

export function getMicDeviceId(): string | null {
  return localStorage.getItem(MIC_DEVICE_KEY);
}

export function setMicDeviceId(deviceId: string | null): void {
  if (deviceId) localStorage.setItem(MIC_DEVICE_KEY, deviceId);
  else localStorage.removeItem(MIC_DEVICE_KEY);
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}

// Briefly opens the mic and closes it again, purely to get the OS/browser
// permission prompt to fire so enumerateDevices() returns real device
// labels afterwards (labels are blank before permission is granted).
export async function requestMicPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private streamDeviceId: string | null | undefined = undefined;

  // Bluetooth headsets renegotiate their mic profile (e.g. A2DP -> HFP) each
  // time getUserMedia() opens a fresh stream, which clips the start of the
  // very next recording. Keep one stream open across an entire practice
  // session -- each take only creates a new MediaRecorder on top of it --
  // and only re-acquire if the configured device actually changed or the
  // previous stream's track ended.
  private async ensureStream(): Promise<MediaStream> {
    const deviceId = getMicDeviceId();
    const stillLive = this.stream?.getAudioTracks().some((t) => t.readyState === 'live');
    if (this.stream && stillLive && this.streamDeviceId === deviceId) {
      return this.stream;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    this.streamDeviceId = deviceId;
    return this.stream;
  }

  async start(): Promise<void> {
    const stream = await this.ensureStream();
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    this.mediaRecorder.start();
  }

  async stop(): Promise<Blob> {
    const recorder = this.mediaRecorder;
    if (!recorder) throw new Error('Recorder was not started.');
    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        resolve(new Blob(this.chunks, { type: this.chunks[0]?.type ?? 'audio/webm' }));
      });
      recorder.stop();
    });
  }

  // Fully releases the microphone. Call when leaving a practice session so
  // the mic isn't left "hot" indefinitely between sessions.
  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.streamDeviceId = undefined;
  }
}

// Whisper expects 16kHz mono PCM; resample and encode a WAV client-side
// so we don't depend on the server's container/codec support.
export async function toWav16kMono(blob: Blob): Promise<Blob> {
  const targetRate = 16000;
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frameCount, targetRate);

  let monoBuffer: AudioBuffer;
  if (decoded.numberOfChannels > 1) {
    monoBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = monoBuffer.getChannelData(0);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < data.length; i++) out[i] += data[i] / decoded.numberOfChannels;
    }
  } else {
    monoBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    monoBuffer.copyToChannel(decoded.getChannelData(0), 0);
  }

  const source = offline.createBufferSource();
  source.buffer = monoBuffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
