import type { DialogueTurn, LessonsData, Section } from '../data/types';
import { escapeHtml } from './util';
import { speak } from '../lib/tts';
import { Recorder, toWav16kMono } from '../lib/stt';
import { transcribe } from '../lib/whisperClient';
import { isMatch } from '../lib/textMatch';

type TurnState =
  | { kind: 'idle' }
  | { kind: 'revealed' }
  | { kind: 'recording' }
  | { kind: 'result'; transcript: string; correct: boolean; error?: string; audioUrl?: string; recordedSec?: number };

export function renderDialoguePractice(
  root: HTMLElement,
  data: LessonsData,
  chapterId: string,
  sectionIndex: number,
): void {
  const chapter = data.chapters.find((c) => c.id === chapterId);
  const section = chapter?.sections[sectionIndex];
  const backHref = `#/lesson/${chapterId}`;

  if (!chapter || !section || section.dialogue.length === 0) {
    root.innerHTML = `
      <header class="topbar"><a href="${backHref}" class="back">&#8592;</a><h1>Dialogue</h1></header>
      <div class="scroll"><p class="empty">Dialogue not found.</p></div>`;
    return;
  }

  const speakers = [...new Set(section.dialogue.map((t) => t.speaker))];

  if (speakers.length < 2) {
    renderPlayThrough(root, section, backHref);
    return;
  }

  renderSpeakerPicker();

  function renderSpeakerPicker(): void {
    root.innerHTML = `
      <header class="topbar"><a href="${backHref}" class="back" aria-label="Back">&#8592;</a><h1>Choose your role</h1></header>
      <div class="scroll center">
        <p>Play the part of:</p>
        <div class="controls stack">
          ${speakers
            .map((s, i) => `<button class="button role-btn" data-idx="${i}">${escapeHtml(s)}</button>`)
            .join('')}
        </div>
        <p class="hint">Or just listen and read along.</p>
        <button id="btn-listen-only" class="button">Listen only</button>
      </div>
    `;
    root.querySelectorAll<HTMLButtonElement>('.role-btn').forEach((btn) => {
      btn.addEventListener('click', () => startPractice(speakers[Number(btn.dataset.idx)]));
    });
    root.querySelector('#btn-listen-only')?.addEventListener('click', () => startPractice(null));
  }

  function startPractice(userSpeaker: string | null): void {
    let turnIndex = 0;
    let state: TurnState = { kind: 'idle' };
    const recorder = new Recorder();
    let lastAudioUrl: string | null = null;
    let previewAudio: HTMLAudioElement | null = null;

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

    function render(): void {
      if (turnIndex >= section!.dialogue.length) {
        recorder.release();
        root.innerHTML = `
          <header class="topbar"><a href="${backHref}" class="back">&#8592;</a><h1>Complete</h1></header>
          <div class="scroll center">
            <a class="button primary block" href="${backHref}">Back to chapter</a>
          </div>`;
        return;
      }

      const turn = section!.dialogue[turnIndex];
      const isUserLine = userSpeaker !== null && turn.speaker === userSpeaker;

      root.innerHTML = `
        <header class="topbar">
          <a href="${backHref}" class="back" aria-label="Back">&#8592;</a>
          <h1>Dialogue</h1>
          <span class="progress-count">${turnIndex + 1} / ${section!.dialogue.length}</span>
        </header>
        <div class="scroll">
          <div class="transcript">
            ${section!.dialogue
              .slice(0, turnIndex)
              .map((t) => pastTurnHtml(t))
              .join('')}
            <div class="turn current ${isUserLine ? 'user-turn' : 'other-turn'}">
              <div class="speaker">${escapeHtml(turn.speaker)}${isUserLine ? ' (you)' : ''}</div>
              ${isUserLine ? userTurnBody(turn) : otherTurnBody(turn)}
            </div>
          </div>
        </div>
      `;
      attachHandlers(turn, isUserLine);
    }

    function pastTurnHtml(t: DialogueTurn): string {
      return `<div class="turn past">
        <div class="speaker">${escapeHtml(t.speaker)}</div>
        <div class="greek">${escapeHtml(t.greek)}</div>
        <div class="english">${escapeHtml(t.english)}</div>
      </div>`;
    }

    function otherTurnBody(t: DialogueTurn): string {
      return `
        <div class="greek">${escapeHtml(t.greek)}</div>
        <div class="phonetic">${escapeHtml(t.phonetic)}</div>
        <div class="english">${escapeHtml(t.english)}</div>
        <div class="controls">
          <button id="btn-play" class="button">&#128266; Play</button>
          <button id="btn-next" class="button primary">Next &#8594;</button>
        </div>
      `;
    }

    function userTurnBody(t: DialogueTurn): string {
      const englishPrompt = `<div class="english prompt">${escapeHtml(t.english)}</div>`;

      if (state.kind === 'idle') {
        return `${englishPrompt}
          <div class="controls">
            <button id="btn-reveal" class="button">&#128065; Show Greek</button>
            <button id="btn-record" class="button">&#127908; Record</button>
          </div>`;
      }
      if (state.kind === 'revealed') {
        return `${englishPrompt}
          <div class="greek">${escapeHtml(t.greek)}</div>
          <div class="phonetic">${escapeHtml(t.phonetic)}</div>
          <div class="controls">
            <button id="btn-record" class="button">&#127908; Record</button>
            <button id="btn-next" class="button primary">Next &#8594;</button>
          </div>`;
      }
      if (state.kind === 'recording') {
        return `${englishPrompt}
          <div class="recording-indicator">&#127911; Recording&hellip; speak now</div>
          <div class="controls"><button id="btn-stop" class="button danger">&#9209; Stop</button></div>`;
      }

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
      return `${englishPrompt}
        <div class="greek">${escapeHtml(t.greek)}</div>
        ${verdict}
        ${durationHint}
        <div class="controls">
          ${hear}
          <button id="btn-record" class="button">&#127908; Try again</button>
          <button id="btn-next" class="button primary">Next &#8594;</button>
        </div>`;
    }

    function attachHandlers(turn: DialogueTurn, isUserLine: boolean): void {
      root.querySelector('#btn-play')?.addEventListener('click', () => speak(turn.greek));
      root.querySelector('#btn-next')?.addEventListener('click', () => {
        releaseAudioUrl();
        turnIndex++;
        state = { kind: 'idle' };
        render();
      });
      root.querySelector('#btn-reveal')?.addEventListener('click', () => {
        state = { kind: 'revealed' };
        render();
      });
      root.querySelector('#btn-hear')?.addEventListener('click', () => {
        if (state.kind === 'result' && state.audioUrl) playPreview(state.audioUrl);
      });
      if (isUserLine) {
        root.querySelector('#btn-record')?.addEventListener('click', () => void startRecording());
        root.querySelector('#btn-stop')?.addEventListener('click', () => void stopRecording(turn));
      }
    }

    async function startRecording(): Promise<void> {
      try {
        await recorder.start();
        state = { kind: 'recording' };
      } catch {
        state = { kind: 'result', transcript: '', correct: false, error: 'Microphone permission denied.' };
      }
      render();
    }

    async function stopRecording(turn: DialogueTurn): Promise<void> {
      try {
        const blob = await recorder.stop();
        const wav = await toWav16kMono(blob);
        releaseAudioUrl();
        lastAudioUrl = URL.createObjectURL(wav);
        const recordedSec = (wav.size - 44) / (16000 * 2);
        const transcript = await transcribe(wav);
        const correct = isMatch(turn.greek, transcript);
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

    render();
  }
}

function renderPlayThrough(root: HTMLElement, section: Section, backHref: string): void {
  root.innerHTML = `
    <header class="topbar"><a href="${backHref}" class="back" aria-label="Back">&#8592;</a><h1>Dialogue</h1></header>
    <div class="scroll">
      ${section.dialogue
        .map(
          (t, i) => `
        <div class="turn">
          <div class="speaker">${escapeHtml(t.speaker)}</div>
          <div class="greek">${escapeHtml(t.greek)}</div>
          <div class="phonetic">${escapeHtml(t.phonetic)}</div>
          <div class="english">${escapeHtml(t.english)}</div>
          <button class="button btn-play" data-i="${i}">&#128266; Play</button>
        </div>
      `,
        )
        .join('')}
    </div>
  `;
  root.querySelectorAll<HTMLButtonElement>('.btn-play').forEach((btn) => {
    btn.addEventListener('click', () => speak(section.dialogue[Number(btn.dataset.i)].greek));
  });
}
