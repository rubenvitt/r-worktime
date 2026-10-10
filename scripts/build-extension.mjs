// Baut die Browser-Extension je Browser nach dist/extension/{chrome,firefox}.
// Aufruf: pnpm build:extension
// Quelle ist extension/, deren manifest.json für Chrome gilt (dort weiterhin direkt
// als entpackte Erweiterung ladbar). Firefox kennt in MV3 keinen Service Worker und
// bekommt stattdessen background.scripts.

import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "extension");
const outDir = join(root, "dist", "extension");

const baseManifest = JSON.parse(
  readFileSync(join(sourceDir, "manifest.json"), "utf8"),
);

const targets = {
  chrome: (manifest) => manifest,
  firefox: (manifest) => ({
    ...manifest,
    background: { scripts: ["lib/timesheet-schema.js", "background.js"] },
  }),
};

rmSync(outDir, { recursive: true, force: true });

for (const [browser, transform] of Object.entries(targets)) {
  const targetDir = join(outDir, browser);
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (src) => !["README.md", ".DS_Store"].includes(basename(src)),
  });
  const manifest = transform(structuredClone(baseManifest));
  writeFileSync(
    join(targetDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`${browser}: ${targetDir}`);
}
