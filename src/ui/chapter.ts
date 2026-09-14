import type { Chapter, LessonsData } from '../data/types';
import { escapeHtml } from './util';

function totalVocab(chapter: Chapter): number {
  return chapter.sections.reduce((s, sec) => s + sec.vocab.length, 0);
}

export function renderChapter(root: HTMLElement, data: LessonsData, chapterId: string): void {
  const chapter = data.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    root.innerHTML = '<p class="empty">Chapter not found.</p>';
    return;
  }

  root.innerHTML = `
    <header class="topbar">
      <a href="#/" class="back" aria-label="Back">&#8592;</a>
      <h1>${escapeHtml(chapter.title.greek)}</h1>
    </header>
    <div class="scroll">
      <p class="subtitle">${escapeHtml(chapter.title.english)}</p>
      <a class="button primary block" href="#/lesson/${chapter.id}/vocab">
        &#128266; Practice all vocab (${totalVocab(chapter)} words)
      </a>
      <ul class="list">
        ${chapter.sections
          .map(
            (s, i) => `
          <li class="section-row">
            <div class="section-info">
              <span class="section-title">Section ${i + 1}</span>
              <span class="meta">${s.dialogue.length} lines &middot; ${s.vocab.length} words</span>
            </div>
            <div class="section-actions">
              ${s.dialogue.length > 0 ? `<a class="button" href="#/lesson/${chapter.id}/dialogue/${i}">Dialogue</a>` : ''}
              ${s.vocab.length > 0 ? `<a class="button" href="#/lesson/${chapter.id}/vocab/${i}">Vocab</a>` : ''}
            </div>
          </li>
        `,
          )
          .join('')}
      </ul>
    </div>
  `;
}
