// Erzeugt App-Icon, Favicon und PWA-Icons aus einer einzigen SVG-Vorlage.
// Aufruf: pnpm generate:icons
// Gerendert wird mit Playwright (Chromium); ist es nicht im Projekt installiert,
// wird die globale Installation genommen. Das Motiv: ein Fortschrittsring wie im
// Dashboard, dessen grünes Segment für Überstunden steht, mit Uhrzeigern in der Mitte.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "src", "app");
const publicIconDir = join(root, "public", "icons");

// rounded: Ecken selbst abrunden (Favicon, "any"-Icons). Maskable- und Apple-Icons
// müssen vollflächig sein, dort schneidet das System die Form zu.
// scale: Größe des Motivs; bei maskable muss es in der Safe Zone (80 % Kreis) bleiben.
function iconSvg({ rounded, scale }) {
  const rx = rounded ? 116 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>R-Worktime</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4081d2"/>
      <stop offset="1" stop-color="#203876"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.2" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#glow)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke-linecap="round">
    <circle cx="256" cy="256" r="120" stroke="#fff" stroke-opacity="0.16" stroke-width="40"/>
    <path d="M256 136 A120 120 0 1 1 143.24 297.04" stroke="#fff" stroke-width="40"/>
    <path d="M137.82 235.17 A120 120 0 0 1 196 152.08" stroke="#67cc9a" stroke-width="40"/>
    <path d="M256 256 V188 M256 256 L304 284" stroke="#fff" stroke-width="24"/>
    <circle cx="256" cy="256" r="16" fill="#fff" stroke="none"/>
  </g>
</svg>
`;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return import(
      pathToFileURL(join(globalRoot, "playwright", "index.mjs")).href
    );
  }
}

// ICO-Container mit eingebetteten PNGs (seit Windows Vista von allen Browsern unterstützt).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ data }) => data)]);
}

const variants = {
  any: iconSvg({ rounded: true, scale: 1.12 }),
  maskable: iconSvg({ rounded: false, scale: 1 }),
  apple: iconSvg({ rounded: false, scale: 1.08 }),
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true, type: "png" });
}

mkdirSync(publicIconDir, { recursive: true });

writeFileSync(join(appDir, "icon.svg"), variants.any);
writeFileSync(
  join(appDir, "apple-icon.png"),
  await render(variants.apple, 180),
);
const faviconPngs = [];
for (const size of [16, 32, 48]) {
  faviconPngs.push({ size, data: await render(variants.any, size) });
}
writeFileSync(join(appDir, "favicon.ico"), buildIco(faviconPngs));

for (const size of [192, 512]) {
  writeFileSync(
    join(publicIconDir, `icon-${size}.png`),
    await render(variants.any, size),
  );
  writeFileSync(
    join(publicIconDir, `icon-maskable-${size}.png`),
    await render(variants.maskable, size),
  );
}

await browser.close();
console.log("Icons erzeugt in src/app und public/icons");
