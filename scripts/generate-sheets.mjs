// Renders placeholder spritesheets from the vector standees in SpriteVector.svelte.
//
// Each unit gets src/lib/assets/units/<slug>.png: a 4×4 sheet (4 frames per row,
// one row per pose — idle / attack / hit / death), frame 128×160 px (2× the 64×80
// viewBox). Drop a hand-drawn sheet with the same name and layout over any file
// to replace the placeholder; rerun `npm run sprites` to regenerate the rest.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(root, 'src/lib/ui/SpriteVector.svelte');
const OUT_DIR = path.join(root, 'src/lib/assets/units');

// Must match src/lib/ui/sprites.ts.
const POSES = ['idle', 'attack', 'hit', 'death'];
const FRAMES = 4;
const CELL = { w: 64, h: 80 };
const SCALE = 2;
// Feet anchor of the standees (see SpriteVector.svelte: "feet on y≈78").
const FOOT = { x: 32, y: 78 };

/** Extract each `{#if name === '…'}` block's SVG body from the Svelte template. */
async function extractUnits() {
  const source = await readFile(SOURCE, 'utf8');
  const marker = /\{#if name === '([^']+)'\}|\{:else if name === '([^']+)'\}|\{:else\}|\{\/if\}/g;
  const units = new Map();
  let current = null;
  let bodyStart = 0;
  for (const m of source.matchAll(marker)) {
    if (current) units.set(current, source.slice(bodyStart, m.index).trim());
    current = m[1] ?? m[2] ?? null; // null for {:else} and {/if}
    bodyStart = m.index + m[0].length;
  }
  if (units.size === 0) throw new Error(`no unit blocks found in ${SOURCE}`);
  return units;
}

/**
 * Per-frame transform + opacity, anchored at the feet so units pivot like
 * standees. Art faces right; the enemy side is mirrored in CSS.
 */
function frame(pose, f, animate) {
  const about = (t) => `translate(${FOOT.x} ${FOOT.y}) ${t} translate(${-FOOT.x} ${-FOOT.y})`;
  if (!animate) return { transform: '', opacity: 1 };
  switch (pose) {
    case 'idle': {
      const dy = [0, -1.2, -0.4, 0.6][f];
      const sy = [1, 1.015, 1.005, 0.99][f];
      return { transform: `translate(0 ${dy}) ${about(`scale(1 ${sy})`)}`, opacity: 1 };
    }
    case 'attack': {
      const a = [0, 6, 14, 5][f];
      const dx = [0, 1.5, 4, 1.5][f];
      return { transform: `translate(${dx} 0) ${about(`rotate(${a})`)}`, opacity: 1 };
    }
    case 'hit': {
      const a = [0, -5, -10, -4][f];
      const dx = [0, -1.5, -4, -1.5][f];
      return { transform: `translate(${dx} 0) ${about(`rotate(${a})`)}`, opacity: 1 };
    }
    case 'death': {
      const a = [0, -10, -19, -27][f];
      const dy = [0, 3, 7, 11][f];
      return { transform: `translate(0 ${dy}) ${about(`rotate(${a})`)}`, opacity: [1, 0.85, 0.65, 0.45][f] };
    }
  }
}

function sheetSvg(name, body) {
  const animate = name !== 'Rock'; // obstacles hold still
  const cells = [];
  for (const [row, pose] of POSES.entries()) {
    for (let f = 0; f < FRAMES; f++) {
      const { transform, opacity } = frame(pose, f, animate);
      cells.push(
        `<g transform="translate(${f * CELL.w} ${row * CELL.h})"><g clip-path="url(#cell)">` +
          `<g opacity="${opacity}" transform="${transform}">` +
          `<g stroke="#0f172a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${body}</g>` +
          `</g></g></g>`,
      );
    }
  }
  const w = CELL.w * FRAMES;
  const h = CELL.h * POSES.length;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * SCALE}" height="${h * SCALE}">` +
    `<defs><clipPath id="cell"><rect x="0" y="0" width="${CELL.w}" height="${CELL.h}"/></clipPath></defs>` +
    cells.join('') +
    `</svg>`
  );
}

const slug = (name) => name.toLowerCase().replace(/\s+/g, '-');

const units = await extractUnits();
await mkdir(OUT_DIR, { recursive: true });
for (const [name, body] of units) {
  const png = await sharp(Buffer.from(sheetSvg(name, body))).png().toBuffer();
  await writeFile(path.join(OUT_DIR, `${slug(name)}.png`), png);
}
console.log(`wrote ${units.size} sheets to ${path.relative(root, OUT_DIR)}`);
