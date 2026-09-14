import './styles.css';
import lessons from './data/lessons.json';
import type { LessonsData } from './data/types';
import { renderLessonList } from './ui/lessonList';
import { renderChapter } from './ui/chapter';
import { renderVocabPractice } from './ui/vocabPractice';
import { renderDialoguePractice } from './ui/dialoguePractice';
import { renderSettings } from './ui/settings';
import { registerServiceWorker } from './registerSW';

const data = lessons as LessonsData;
const app = document.getElementById('app')!;

function route(): void {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'settings') {
    renderSettings(app);
  } else if (parts[0] === 'lesson' && parts[2] === 'vocab') {
    const sectionIndex = parts[3] !== undefined ? Number(parts[3]) : undefined;
    renderVocabPractice(app, data, parts[1], sectionIndex);
  } else if (parts[0] === 'lesson' && parts[2] === 'dialogue') {
    renderDialoguePractice(app, data, parts[1], Number(parts[3]));
  } else if (parts[0] === 'lesson' && parts.length === 2) {
    renderChapter(app, data, parts[1]);
  } else {
    renderLessonList(app, data);
  }

  window.scrollTo(0, 0);
}

// Suppress iOS's long-press selection/callout bar on repeatedly-tapped
// controls; must be a non-passive touchstart listener (preventDefault on
// pointerdown does not suppress it), scoped to the whole layout since the
// callout belongs to whichever element receives the tap.
document.addEventListener(
  'touchstart',
  (e) => {
    if ((e.target as HTMLElement | null)?.closest('button, a')) {
      e.preventDefault();
    }
  },
  { passive: false },
);

window.addEventListener('hashchange', route);
route();
registerServiceWorker();
