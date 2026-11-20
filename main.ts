// Solmar City — submission entrypoint (Phase 9, builder J8).
//
// Hands the game in: copies game/ and screenshots/ from this repository
// into the output directory, builds dossier.json with the kit library,
// and prints one summary line. Node 24 stdlib only, no build step.
// Run it as:  MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
// (or with no variable, which writes to /output).

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in
// (resolve() strips any trailing separator so joins stay predictable).
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));

// The scorer's caps, exactly as the kit library expects them.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Count the plain files under a directory, walking it depth-first.
function countFiles(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const here = stack.pop();
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      const next = join(here, entry.name);
      if (entry.isDirectory()) stack.push(next);
      else if (entry.isFile()) total += 1;
    }
  }
  return total;
}

// Copy a whole directory tree when the source exists; skip it silently
// when it does not (screenshots/ may not exist yet while the game is
// still being built — buildDossier will then say so, clearly).
function copyIfPresent(from, to) {
  if (!existsSync(from)) return false;
  cpSync(from, to, { recursive: true, force: true });
  return true;
}

function handIn() {
  const rawOut = process.env.MAKEFUN_OUTPUT_DIR;
  const outDir = rawOut !== undefined && rawOut.trim() !== '' ? rawOut.trim() : '/output';
  mkdirSync(outDir, { recursive: true });

  const gameSrc = join(repoRoot, 'game');
  if (!existsSync(gameSrc)) {
    throw new Error('game/ is missing from the repository, nothing to hand in');
  }
  // Clear any stale copy from an earlier run so removed files do not linger.
  rmSync(join(outDir, 'game'), { recursive: true, force: true });
  cpSync(gameSrc, join(outDir, 'game'), { recursive: true, force: true });

  const shotsSrc = join(repoRoot, 'screenshots');
  rmSync(join(outDir, 'screenshots'), { recursive: true, force: true });
  const shotsCopied = copyIfPresent(shotsSrc, join(outDir, 'screenshots'));
  if (!shotsCopied) {
    console.error('main.ts: warning: no screenshots/ in the repo yet — the dossier needs 3-4 screenshots');
  }
  let shotTotal = 0;
  if (shotsCopied) {
    shotTotal = readdirSync(join(outDir, 'screenshots'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.')).length;
  }

  const dossierBytes = buildDossier(outDir, dossierCaps);
  writeFileSync(join(outDir, 'dossier.json'), dossierBytes);

  const gameFiles = countFiles(join(outDir, 'game'));
  console.log(
    `Solmar City handed in: ${gameFiles} game files, ${shotTotal} screenshots, ` +
    `dossier.json ${dossierBytes.length} bytes -> ${outDir}`,
  );
}

try {
  handIn();
} catch (err) {
  console.error(`main.ts: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
