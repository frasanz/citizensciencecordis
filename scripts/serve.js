// Servidor estatico minimo para desarrollo: node scripts/serve.js [puerto]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const PUERTO = Number(process.argv[2]) || 8000;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.csv': 'text/csv', '.svg': 'image/svg+xml', '.css': 'text/css' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const destino = path.join(RAIZ, rel === '/' ? 'index.html' : rel);
  if (!destino.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  fs.readFile(destino, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(destino)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PUERTO, () => console.log(`http://localhost:${PUERTO}`));
