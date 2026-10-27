// Servidor local do Espelho Zumbi: serve os arquivos e salva as fotos na pasta "fotos".
// Uso: node server.js   (depois abra http://localhost:8031)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8031;
const ROOT = __dirname;
const FOTOS = path.join(ROOT, 'fotos');
const CENARIOS = path.join(ROOT, 'cenarios');
fs.mkdirSync(FOTOS, { recursive: true });
fs.mkdirSync(CENARIOS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function stamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

function salvarFoto(req, res) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 20e6) { res.writeHead(413).end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    const m = Buffer.concat(chunks).toString().match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) { res.writeHead(400).end('formato invalido'); return; }
    const nome = `monstro-${stamp()}.jpg`;
    fs.writeFile(path.join(FOTOS, nome), Buffer.from(m[1], 'base64'), (err) => {
      if (err) { res.writeHead(500).end(String(err)); return; }
      console.log('Foto salva:', nome);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ nome }));
    });
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/foto') return salvarFoto(req, res);
  if (req.method === 'GET' && req.url === '/api/cenarios') {
    fs.readdir(CENARIOS, (err, arquivos) => {
      const lista = (arquivos || []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(JSON.stringify(lista));
    });
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }

  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(FOTOS)) { res.writeHead(403).end(); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('nao encontrado'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Espelho Zumbi rodando em http://localhost:${PORT}`);
  console.log(`Fotos serao salvas em: ${FOTOS}`);
});
