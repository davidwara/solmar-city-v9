// Solmar City — tiny static dev server (Phase 9, builder J8).
//
// Serves this repository's root over plain HTTP so the game can be
// played in a desktop browser with no build step:
//   node serve.ts
//   open http://localhost:8080/          (serves game/index.html)
// Node 24 stdlib only, plain JavaScript syntax inside the .ts file.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = 8080;

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

// Turn a request path into an absolute file under the repo root.
// Returns null for anything that would escape the root.
function resolveRequest(rawUrl) {
  let clean;
  try {
    clean = decodeURIComponent(rawUrl.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const rel = clean === '/' || clean === '' ? 'game/index.html' : clean.replace(/^\/+/, '');
  const full = resolve(join(repoRoot, rel));
  if (full !== repoRoot && !full.startsWith(repoRoot + sep)) return null;
  return full;
}

function serveFile(file, res) {
  const type = mimeByExt[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 failed to read file\n');
    console.log(`GET ${file} -> 500 (read error)`);
  });
  stream.pipe(res);
}

const server = createServer((req, res) => {
  const target = resolveRequest(req.url || '/');
  let file = target;
  if (file !== null && existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, 'index.html');
  }
  if (file === null || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 not found\n');
    console.log(`${req.method} ${req.url} -> 404`);
    return;
  }
  serveFile(file, res);
  console.log(`${req.method} ${req.url} -> 200`);
});

server.listen(port, () => {
  console.log(`Solmar City dev server at http://localhost:${port}/`);
});
