// Gatorback Delta — entry program for make.fun gta6-01 (Node 22, stdlib only).
// It assembles the hand-in: copies this repo's game/ and screenshots/ into the
// output directory and writes dossier.json there with the vendored library.
// Run locally as: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the output directory is /output.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const targetDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function fail(message) {
  console.error(`gatorback-delta: ${message}`);
  process.exit(1);
}

function mustExist(path, what) {
  if (!existsSync(path)) fail(`missing ${what}: ${path}`);
  if (!statSync(path).isDirectory() && what !== 'file') fail(`${what} is not a directory: ${path}`);
}

function copyTreeInto(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source).sort()) {
    const from = join(source, name);
    const to = join(destination, name);
    if (statSync(from).isDirectory()) copyTreeInto(from, to);
    else cpSync(from, to);
  }
}

function freshOutputDir(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const gameSource = join(repoRoot, 'game');
const shotsSource = join(repoRoot, 'screenshots');
const indexPage = join(gameSource, 'index.html');

mustExist(gameSource, 'game/');
mustExist(shotsSource, 'screenshots/');
if (!existsSync(indexPage)) fail(`missing game/index.html: ${indexPage}`);

const shotNames = readdirSync(shotsSource)
  .filter((n) => !n.startsWith('.'))
  .sort();
if (shotNames.length < 3 || shotNames.length > 4) {
  fail(`screenshots/ must hold 3 or 4 images, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const bytes = statSync(join(shotsSource, name)).size;
  if (bytes > 262144) fail(`screenshot ${name} is ${bytes} bytes, over the 256 KiB cap`);
}

freshOutputDir(targetDir);
copyTreeInto(gameSource, join(targetDir, 'game'));
copyTreeInto(shotsSource, join(targetDir, 'screenshots'));

const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

let dossier;
try {
  dossier = buildDossier(targetDir, dossierCaps);
} catch (err) {
  fail(`dossier build failed: ${err instanceof Error ? err.message : String(err)}`);
}
writeFileSync(join(targetDir, 'dossier.json'), dossier);
console.log(`gatorback-delta: wrote ${targetDir} (${shotNames.length} screenshots, dossier ${dossier.length} bytes)`);
