#!/usr/bin/env node
// One-time conversion: ~/Downloads/greek.epub -> src/data/lessons.json
// Run manually (`npm run parse-epub`); the epub itself is never read at app runtime.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EPUB_PATH = path.join(homedir(), 'Downloads', 'greek.epub');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'lessons.json');

// Chapters carrying real lesson content; the book numbers its own revision
// tests (5, 10, 15) inline, which we skip for v1 practice content.
const CHAPTER_PARTS = [
  'part0010', 'part0011', 'part0012', 'part0013',
  'part0015', 'part0016', 'part0017', 'part0018',
  'part0020', 'part0021', 'part0022', 'part0023',
];

function readZipEntry(entryPath) {
  return execFileSync('unzip', ['-p', EPUB_PATH, entryPath], { maxBuffer: 1024 * 1024 * 20 }).toString('utf-8');
}

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripTags(html) {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chapterTitle(html) {
  const h2s = [...html.matchAll(/<h2 class="h2">([\s\S]*?)<\/h2>/g)];
  if (h2s.length === 0) return null;
  const raw = h2s[0][1];
  const parts = raw.split(/<br\s*\/?>/i).map(stripTags).filter(Boolean);
  return { greek: parts[0] ?? '', english: parts[1] ?? '' };
}

function extractCells(rowHtml) {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
}

function parseDialogueTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => extractCells(m[1]));
  const withTranslation = rows.filter((r) => r.length === 3);
  const greekOnly = rows.filter((r) => r.length === 2);
  const turns = [];
  const count = Math.min(withTranslation.length, greekOnly.length);
  for (let i = 0; i < count; i++) {
    const [speakerCell, phoneticCell, englishCell] = withTranslation[i];
    const [, greekCell] = greekOnly[i];
    turns.push({
      speaker: stripTags(speakerCell),
      greek: stripTags(greekCell),
      phonetic: stripTags(phoneticCell),
      english: stripTags(englishCell),
    });
  }
  return turns;
}

function parseVocabTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => extractCells(m[1]));
  const entries = [];
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const rawLeft = stripTags(cells[0]);
    const english = stripTags(cells[1]);
    if (!rawLeft || !english) continue;
    const phoneticMatches = [...rawLeft.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    const greek = rawLeft.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
    if (!greek) continue;
    entries.push({ greek, phonetic: phoneticMatches.join(' / '), english });
  }
  return entries;
}

// Walk the document as an ordered stream of <table ...>...</table> and
// <h3 ...>...</h3> blocks, so we can pair each dialogue table with the
// QUICK VOCAB table that immediately follows it (skipping grammar/exercise
// tables, which don't have that neighbor).
function extractBlocks(html) {
  const blockRe = /<table\b([^>]*)>([\s\S]*?)<\/table>|<h3\b([^>]*)>([\s\S]*?)<\/h3>/g;
  const blocks = [];
  let m;
  while ((m = blockRe.exec(html))) {
    if (m[2] !== undefined) {
      blocks.push({ type: 'table', attrs: m[1], html: m[0] });
    } else {
      blocks.push({ type: 'h3', text: stripTags(m[4]) });
    }
  }
  return blocks;
}

function parseChapter(partId) {
  const html = readZipEntry(`OEBPS/Text/${partId}.xhtml`);
  const title = chapterTitle(html);
  const blocks = extractBlocks(html);

  const sections = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== 'table' || !/class="bg"/.test(block.attrs)) continue;
    const next1 = blocks[i + 1];
    const next2 = blocks[i + 2];
    if (!next1 || next1.type !== 'h3' || !/QUICK VOCAB/i.test(next1.text)) continue;
    if (!next2 || next2.type !== 'table') continue;

    const dialogue = parseDialogueTable(block.html);
    const vocab = parseVocabTable(next2.html);
    if (dialogue.length === 0 && vocab.length === 0) continue;
    sections.push({ dialogue, vocab });
  }

  return {
    id: partId,
    title: title ?? { greek: '', english: '' },
    sections,
  };
}

function main() {
  const chapters = CHAPTER_PARTS.map(parseChapter);

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ chapters }, null, 2), 'utf-8');

  const totalDialogueTurns = chapters.reduce(
    (sum, c) => sum + c.sections.reduce((s, sec) => s + sec.dialogue.length, 0), 0);
  const totalVocab = chapters.reduce(
    (sum, c) => sum + c.sections.reduce((s, sec) => s + sec.vocab.length, 0), 0);
  console.log(`Parsed ${chapters.length} chapters, ${chapters.reduce((s, c) => s + c.sections.length, 0)} sections, ${totalDialogueTurns} dialogue turns, ${totalVocab} vocab entries -> ${path.relative(process.cwd(), OUT_PATH)}`);
  for (const c of chapters) {
    console.log(`  ${c.id}: ${c.title.greek} / ${c.title.english} (${c.sections.length} sections)`);
  }
}

main();
