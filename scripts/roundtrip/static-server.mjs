/**
 * R6.1 — a dependency-free static server for SEG-5.
 *
 * Committed rather than shelled out to `npx serve`, and that is the point of ruling 5:
 * `npx` fetches from the npm registry on a cold cache, so a harness that used it would
 * have a network dependency in the middle of a run whose whole premise is hermetic.
 * `node:http` and nothing else.
 *
 *   node scripts/roundtrip/static-server.mjs --root <dir> [--port 4173]
 *
 * Resolution order per request path:
 *   1. the file itself
 *   2. `<path>/index.html` for a directory
 *   3. `<path>.html`  ← the brief permits either form (`docs/export-format.md` §3.2 DoD 1)
 * Which one each page needed is reported to the caller so `crawl.json` can record it.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIC_SERVER_HOST, STATIC_SERVER_PORT } from './thresholds.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Never serve outside the root, whatever the URL says. */
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const resolved = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  return resolved.startsWith(path.resolve(root)) ? resolved : null;
}

async function resolveTarget(root, urlPath) {
  const base = safeJoin(root, urlPath);
  if (base === null) return null;

  const candidates = [
    { file: base, how: 'exact' },
    { file: path.join(base, 'index.html'), how: 'directory-index' },
    { file: `${base}.html`, how: 'html-extension' },
  ];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate.file);
      if (info.isFile()) return { ...candidate, size: info.size };
    } catch {
      // try the next form
    }
  }
  return null;
}

/**
 * @param {object} options
 * @param {string} options.root directory to serve
 * @param {number} [options.port]
 * @returns {Promise<{ url: string, resolutions: Map<string,string>, close: () => Promise<void> }>}
 */
export async function startStaticServer({ root, port = STATIC_SERVER_PORT, host = STATIC_SERVER_HOST }) {
  const resolutions = new Map();

  const server = http.createServer((req, res) => {
    resolveTarget(root, req.url ?? '/')
      .then((target) => {
        if (target === null) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('404');
          return;
        }
        resolutions.set(req.url ?? '/', target.how);
        res.writeHead(200, {
          'content-type': MIME[path.extname(target.file).toLowerCase()] ?? 'application/octet-stream',
          'content-length': String(target.size),
          'cache-control': 'no-store',
        });
        createReadStream(target.file).pipe(res);
      })
      .catch(() => {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('500');
      });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    url: `http://${host}:${port}`,
    resolutions,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const rootIndex = argv.indexOf('--root');
  if (rootIndex === -1) {
    process.stderr.write('static-server: --root <dir> is required\n');
    process.exit(2);
  }
  const portIndex = argv.indexOf('--port');
  const port = portIndex === -1 ? STATIC_SERVER_PORT : Number(argv[portIndex + 1]);
  const { url } = await startStaticServer({ root: path.resolve(argv[rootIndex + 1]), port });
  process.stdout.write(`serving ${path.resolve(argv[rootIndex + 1])} at ${url}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
