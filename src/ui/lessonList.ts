import type { LessonsData } from '../data/types';
import { escapeHtml } from './util';

export function renderLessonList(root: HTMLElement, data: LessonsData): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>Greek Practice</h1>
      <a href="#/settings" class="icon-link" aria-label="Settings">&#9881;</a>
    </header>
    <div class="scroll">
      <ul class="list">
        ${data.chapters
          .map(
            (c, i) => `
          <li>
            <a class="chapter-row" href="#/lesson/${c.id}">
              <span class="chapter-num">${i + 1}</span>
              <span class="chapter-titles">
                <span class="greek">${escapeHtml(c.title.greek)}</span>
                <span class="english">${escapeHtml(c.title.english)}</span>
              </span>
              <span class="chevron">&#8250;</span>
            </a>
          </li>
        `,
          )
          .join('')}
      </ul>
    </div>
  `;
}
