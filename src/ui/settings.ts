import { getWhisperUrl, setWhisperUrl } from '../lib/whisperClient';
import { hasGreekVoice } from '../lib/tts';
import {
  Recorder,
  toWav16kMono,
  getMicDeviceId,
  setMicDeviceId,
  listMicrophones,
  requestMicPermission,
} from '../lib/stt';
import { getSttBackend, getSttBackendOverride, setSttBackend, isAndroid } from '../lib/sttBackend';
import { webSpeechAvailable } from '../lib/webSpeechClient';
import { escapeHtml } from './util';

export function renderSettings(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <a href="#/" class="back" aria-label="Back">&#8592;</a>
      <h1>Settings</h1>
    </header>
    <div class="scroll">
      <label class="field">
        <span>Speech recognition</span>
        <select id="stt-backend">
          <option value="auto">Auto (${isAndroid() ? 'browser, cloud' : 'whisper, local'})</option>
          <option value="whisper">Whisper (local server)</option>
          <option value="webspeech" ${webSpeechAvailable() ? '' : 'disabled'}>
            Browser (cloud)${webSpeechAvailable() ? '' : ' — not supported here'}
          </option>
        </select>
      </label>
      <p id="stt-status" class="hint"></p>
      <hr />
      <label class="field">
        <span>Whisper server URL</span>
        <input id="whisper-url" type="text" value="${getWhisperUrl()}" autocapitalize="off" autocorrect="off" spellcheck="false" />
      </label>
      <button id="save-url" class="button primary">Save</button>
      <p id="save-status" class="hint" aria-live="polite"></p>
      <hr />
      <div id="mic-section"></div>
      <hr />
      <p id="voice-status" class="hint">Checking for a Greek text-to-speech voice&hellip;</p>
      <hr />
      <p class="hint">
        Whisper mode needs a local whisper.cpp server running &mdash; see
        <code>whisper/README.md</code> in the project for setup. Browser mode needs no
        setup but sends your recording to your browser's speech service (not local/offline).
      </p>
    </div>
  `;

  const backendSelect = root.querySelector<HTMLSelectElement>('#stt-backend')!;
  backendSelect.value = getSttBackendOverride() ?? 'auto';

  function updateSttStatus(): void {
    const status = root.querySelector('#stt-status')!;
    const active = getSttBackend();
    status.textContent = `Currently using: ${active === 'webspeech' ? 'Browser (cloud)' : 'Whisper (local server)'}.`;
  }
  updateSttStatus();

  backendSelect.addEventListener('change', () => {
    const val = backendSelect.value;
    setSttBackend(val === 'whisper' || val === 'webspeech' ? val : 'auto');
    updateSttStatus();
  });

  root.querySelector('#save-url')?.addEventListener('click', () => {
    const input = root.querySelector<HTMLInputElement>('#whisper-url')!;
    setWhisperUrl(input.value);
    input.value = getWhisperUrl();
    const status = root.querySelector('#save-status')!;
    status.textContent = 'Saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  });

  hasGreekVoice().then((ok) => {
    const el = root.querySelector('#voice-status');
    if (!el) return;
    el.textContent = ok
      ? 'A Greek speech-synthesis voice is available.'
      : 'No Greek (el-*) speech-synthesis voice found. Install one in your OS system settings for the Listen buttons to work.';
  });

  void initMicSection(root);
}

async function initMicSection(root: HTMLElement): Promise<void> {
  const section = root.querySelector<HTMLElement>('#mic-section');
  if (!section) return;

  const recorder = new Recorder();
  let recording = false;
  let previewAudio: HTMLAudioElement | null = null;
  let lastTestUrl: string | null = null;
  let testStatus = '';

  window.addEventListener('hashchange', () => recorder.release(), { once: true });

  async function renderMicSelect(): Promise<void> {
    const devices = await listMicrophones();
    const needsPermission = devices.length === 0 || devices.every((d) => !d.label);
    const current = getMicDeviceId() ?? '';

    section!.innerHTML = `
      <label class="field">
        <span>Microphone</span>
        <select id="mic-select">
          <option value="">System default</option>
          ${devices
            .map(
              (d) =>
                `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === current ? 'selected' : ''}>${escapeHtml(d.label || 'Microphone')}</option>`,
            )
            .join('')}
        </select>
      </label>
      ${
        needsPermission
          ? `<button id="mic-permission" class="button">Enable microphone access to see device names</button>`
          : ''
      }
      <div class="controls" style="justify-content:flex-start; margin-top:0.75rem;">
        <button id="mic-test" class="button">${recording ? '&#9209; Stop test' : '&#127908; Test microphone'}</button>
        ${lastTestUrl ? `<button id="mic-hear" class="button">&#128264; Play test recording</button>` : ''}
      </div>
      ${testStatus ? `<p class="hint">${escapeHtml(testStatus)}</p>` : ''}
    `;

    section!.querySelector('#mic-select')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      setMicDeviceId(val || null);
    });

    section!.querySelector('#mic-permission')?.addEventListener('click', async () => {
      try {
        await requestMicPermission();
        await renderMicSelect();
      } catch {
        testStatus = 'Microphone permission was denied.';
        await renderMicSelect();
      }
    });

    section!.querySelector('#mic-test')?.addEventListener('click', () => void toggleTest());

    section!.querySelector('#mic-hear')?.addEventListener('click', () => {
      if (!lastTestUrl) return;
      previewAudio?.pause();
      previewAudio = new Audio(lastTestUrl);
      previewAudio.play().catch((err) => console.error('Playback failed:', err));
    });
  }

  async function toggleTest(): Promise<void> {
    if (!recording) {
      try {
        await recorder.start();
        recording = true;
        testStatus = 'Recording… speak now, then click Stop.';
      } catch {
        testStatus = 'Could not start recording — check microphone permission.';
      }
      await renderMicSelect();
      return;
    }

    recording = false;
    try {
      const blob = await recorder.stop();
      const wav = await toWav16kMono(blob);
      if (lastTestUrl) URL.revokeObjectURL(lastTestUrl);
      lastTestUrl = URL.createObjectURL(wav);
      const seconds = (wav.size - 44) / (16000 * 2);
      testStatus = `Captured ${seconds.toFixed(1)}s. Click "Play test recording" to check it.`;
    } catch (err) {
      testStatus = err instanceof Error ? err.message : 'Recording failed.';
    }
    await renderMicSelect();
  }

  await renderMicSelect();
}
