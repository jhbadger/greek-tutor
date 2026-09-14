#!/usr/bin/env node
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function svgIcon(size, radius) {
  const fontSize = Math.round(size * 0.42);
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#0b1220"/>
    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}"
          fill="#f2c14e">&#917;&#955;</text>
  </svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, radius: 32 },
  { file: 'icon-512.png', size: 512, radius: 86 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0 },
  { file: 'apple-touch-icon-180.png', size: 180, radius: 32 },
];

for (const t of targets) {
  await sharp(Buffer.from(svgIcon(t.size, t.radius)))
    .png()
    .toFile(path.join(outDir, t.file));
  console.log('wrote', path.join('public/icons', t.file));
}
