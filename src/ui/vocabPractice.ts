import type { LessonsData, VocabEntry } from '../data/types';
import { escapeHtml } from './util';
import { speak, hasGreekVoice } from '../lib/tts';
import { Recorder, toWav16kMono } from '../lib/stt';
import { transcribe } from '../lib/whisperClient';
import { isMatch } from '../lib/textMatch';
import { recordResult } from '../lib/progress';

interface QueueItem {
  itemId: string;
  vocab: VocabEntry;
}

type CardState =
  | { kind: 'prompt' }
  | { kind: 'revealed' }
  | { kind: 'recording' }
  | {
      kind: 'result';
      transcript: string;
      correct: boolean;
      error?: string;
      audioUrl?: string;
      recordedSec?: number;
    };

export function renderVocabPractice(
  root: HTMLElement,
  data: LessonsData,
  chapterId: string,
  sectionIndex?: number,
): void {
  const chapter = data.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    root.innerHTML = '<p class="empty">Chapter not found.</p>';
    return;
  }

  const sectionIndices =
    sectionIndex !== undefined ? [sectionIndex] : chapter.sections.map((_, i) => i);
  const backHref = `#/lesson/${chapterId}`;

  const queue: QueueItem[] = [];
  for (const si of sectionIndices) {
    const section = chapter.sections[si];
    if (!section) continue;
    section.vocab.forEach((v, vi) => {
      queue.push({ itemId: `${chapterId}:s${si}:v${vi}`, vocab: v });
    });
  }
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  if (queue.length === 0) {
    root.innerHTML = `
      <header class="topbar"><a href="${backHref}" class="back">&#8592;</a><h1>Vocab</h1></header>
      <div class="scroll"><p class="empty">No vocab in this section.</p></div>`;
    return;
  }

  let pos = 0;
  const missedRequeued = new Set<string>();
  let correctCount = 0;
  let totalAnswered = 0;
  let state: CardState = { kind: 'prompt' };
  const recorder = new Recorder();
  let lastAudioUrl: string | null = null;
  let previewAudio: HTMLAudioElement | null = null;

  // Release the mic once this screen is left, rather than holding it open
  // forever (it stays open across recordings within this screen on purpose --
  // see Recorder.ensureStream).
  window.addEventListener('hashchange', () => recorder.release(), { once: true });

  function releaseAudioUrl(): void {
    if (lastAudioUrl) {
      URL.revokeObjectURL(lastAudioUrl);
      lastAudioUrl = null;
    }
  }

  function playPreview(url: string): void {
    previewAudio?.pause();
    previewAudio = new Audio(url);
    previewAudio.play().catch((err) => console.error('Playback failed:', err));
  }

  hasGreekVoice().then((ok) => {
    if (!ok) console.warn('No Greek speech-synthesis voice found on this device.');
  });

  function render(): void {
    if (pos >= queue.length) {
      recorder.release();
      root.innerHTML = `
        <header class="topbar"><a href="${backHref}" class="back">&#8592;</a><h1>Done</h1></header>
        <div class="scroll center">
          <p class="big">${correctCount} / ${totalAnswered} correct</p>
          <a class="button primary block" href="${backHref}">Back to chapter</a>
        </div>`;
      return;
    }

    const item = queue[pos];
    const v = item.vocab;

    root.innerHTML = `
      <header class="topbar">
        <a href="${backHref}" class="back" aria-label="Back">&#8592;</a>
        <h1>Vocab</h1>
        <span class="progress-count">${pos + 1} / ${queue.length}</span>
      </header>
      <div class="scroll center card-view">
        <div class="flashcard">
          <div class="greek-word">${escapeHtml(v.greek)}</div>
          ${v.phonetic ? `<div class="phonetic">[${escapeHtml(v.phonetic)}]</div>` : ''}
          ${cardBody()}
        </div>
        <div class="controls">
          <button id="btn-listen" class="button">&#128266; Listen</button>
          ${controlsForState()}
        </div>
      </div>
    `;

    attachHandlers(item, v);
  }

  function cardBody(): string {
    if (state.kind === 'revealed' || state.kind === 'result') {
      return `<div class="english">${escapeHtml(queue[pos].vocab.english)}</div>`;
    }
    if (state.kind === 'recording') {
      return `<div class="recording-indicator">&#127911; Recording&hellip; speak now</div>`;
    }
    return `<div class="english hidden">&mdash; tap Reveal &mdash;</div>`;
  }

  function controlsForState(): string {
    switch (state.kind) {
      case 'prompt':
        return `
          <button id="btn-reveal" class="button">&#128065; Reveal</button>
          <button id="btn-record" class="button">&#127908; Record</button>`;
      case 'revealed':
        return `
          <button id="btn-record" class="button">&#127908; Record</button>
          <button id="btn-next" class="button primary">Next &#8594;</button>`;
      case 'recording':
        return `<button id="btn-stop" class="button danger">&#9209; Stop</button>`;
      case 'result': {
        const verdict = state.error
          ? `<div class="verdict error">${escapeHtml(state.error)}</div>`
          : `<div class="verdict ${state.correct ? 'correct' : 'incorrect'}">
               ${state.correct ? '&#10003; Correct' : '&#10007; Not quite'} &mdash; heard: &ldquo;${escapeHtml(state.transcript)}&rdquo;
             </div>`;
        const hear = state.audioUrl
          ? `<button id="btn-hear" class="button">&#128264; Hear yourself</button>`
          : '';
        const durationHint =
          state.recordedSec !== undefined
            ? `<p class="hint">Recorded ${state.recordedSec.toFixed(1)}s of audio</p>`
            : '';
        return `
          ${verdict}
          ${durationHint}
          ${hear}
          <button id="btn-record" class="button">&#127908; Record again</button>
          <button id="btn-next" class="button primary">Next &#8594;</button>`;
      }
    }
  }

  function attachHandlers(item: QueueItem, v: VocabEntry): void {
    root.querySelector('#btn-listen')?.addEventListener('click', () => speak(v.greek));
    root.querySelector('#btn-reveal')?.addEventListener('click', () => {
      state = { kind: 'revealed' };
      render();
    });
    root.querySelector('#btn-record')?.addEventListener('click', () => void startRecording(item, v));
    root.querySelector('#btn-stop')?.addEventListener('click', () => void stopRecording(item, v));
    root.querySelector('#btn-next')?.addEventListener('click', () => advance());
    root.querySelector('#btn-hear')?.addEventListener('click', () => {
      if (state.kind === 'result' && state.audioUrl) playPreview(state.audioUrl);
    });
  }

  async function startRecording(_item: QueueItem, _v: VocabEntry): Promise<void> {
    try {
      await recorder.start();
      state = { kind: 'recording' };
    } catch {
      state = { kind: 'result', transcript: '', correct: false, error: 'Microphone permission denied.' };
    }
    render();
  }

  async function stopRecording(item: QueueItem, v: VocabEntry): Promise<void> {
    try {
      const blob = await recorder.stop();
      const wav = await toWav16kMono(blob);
      releaseAudioUrl();
      lastAudioUrl = URL.createObjectURL(wav);
      const recordedSec = (wav.size - 44) / (16000 * 2);
      const transcript = await transcribe(wav);
      const correct = isMatch(v.greek, transcript);
      totalAnswered++;
      if (correct) {
        correctCount++;
      } else if (!missedRequeued.has(item.itemId)) {
        missedRequeued.add(item.itemId);
        queue.push(item);
      }
      await recordResult(item.itemId, correct);
      state = { kind: 'result', transcript, correct, audioUrl: lastAudioUrl, recordedSec };
    } catch (err) {
      state = {
        kind: 'result',
        transcript: '',
        correct: false,
        error: err instanceof Error ? err.message : 'Transcription failed.',
      };
    }
    render();
  }

  function advance(): void {
    releaseAudioUrl();
    pos++;
    state = { kind: 'prompt' };
    render();
  }

  render();
}
