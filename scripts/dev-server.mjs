// dev-server.mjs
// Tiny local web server for the test page – no dependencies (node:http only).
//
//   npm run dev              → http://localhost:5173/demo/
//   PORT=8080 npm run dev    → other port (PowerShell: $env:PORT=8080; npm run dev)
//
// It also listens on the local network, so the test page can be opened on a phone or
// tablet on the same wifi. The addresses are printed at start-up.
// (Windows may ask once whether Node.js may accept connections on private networks – allow it.)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Only these folders are served (never node_modules, source-material, .git, …).
const ALLOWED = ['demo', 'src', 'data', 'assets', 'dist'];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    res.writeHead(302, { Location: '/demo/' });
    return res.end();
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(root, pathname));
  const top = path.relative(root, filePath).split(path.sep)[0];
  if (!filePath.startsWith(root) || !ALLOWED.includes(top) || filePath.endsWith('.xlsx')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', // always serve the latest version while testing
    });
    res.end(content);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} er opptatt. Prøv en annen: $env:PORT=8080; npm run dev`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  console.log('\nTestsiden kjører:');
  console.log(`  Denne PC-en:   http://localhost:${port}/demo/`);
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Lokalt nett:   http://${a.address}:${port}/demo/   (mobil/nettbrett på samme wifi)`);
    }
  }
  console.log('\nStopp med Ctrl+C.\n');
});
