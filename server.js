// Servidor local do Espelho Zumbi: serve os arquivos e salva as fotos na pasta "fotos".
// Uso: node server.js   (depois abra http://localhost:8031)
// Os celulares na mesma rede Wi-Fi baixam as fotos pelo QR code (http://<ip-deste-pc>:8031/f/<foto>).
// Se o IP detectado não for o certo, defina ENDERECO_FOTOS (ex.: set ENDERECO_FOTOS=http://192.168.0.10:8031).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

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

const NOME_FOTO = /^monstro-[0-9a-f-]+\.jpg$/;

function stamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

// IP deste computador na rede local (ignora adaptadores virtuais: WSL, Hyper-V, VirtualBox, VPN...)
function ipNaRede() {
  const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|loopback|docker|tailscale|zerotier|vpn/i;
  const candidatos = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const e of lista || []) {
      if (e.family !== 'IPv4' && e.family !== 4) continue;
      if (e.internal || e.address.startsWith('169.254.')) continue;
      candidatos.push({ ip: e.address, prioridade: (virtual.test(nome) ? 2 : 0) + (/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(e.address) ? 0 : 1) });
    }
  }
  candidatos.sort((a, b) => a.prioridade - b.prioridade);
  return candidatos[0]?.ip || null;
}

function enderecoDownload() {
  if (process.env.ENDERECO_FOTOS) return process.env.ENDERECO_FOTOS.replace(/\/+$/, '');
  const ip = ipNaRede();
  return ip ? `http://${ip}:${PORT}` : null;
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
    // o sufixo aleatório impede que alguém adivinhe o link das fotos dos outros
    const nome = `monstro-${stamp()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    fs.writeFile(path.join(FOTOS, nome), Buffer.from(m[1], 'base64'), (err) => {
      if (err) { res.writeHead(500).end(String(err)); return; }
      console.log('Foto salva:', nome);
      const base = enderecoDownload();
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ nome, url: base && `${base}/f/${nome}` }));
    });
  });
}

// página que abre no celular ao ler o QR code
function paginaFoto(nome) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sua foto · Noite dos Monstros</title>
<style>
  @font-face { font-family: 'Creepster'; src: url('/vendor/Creepster-Regular.ttf') format('truetype'); }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #0a0000; color: #e8e8e8; font-family: system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px 16px 32px; text-align: center; }
  h1 { margin: 0; font-family: 'Creepster', Impact, sans-serif; font-weight: normal; font-size: 2.6rem; line-height: 1;
    color: #ff2b2b; text-shadow: 0 0 18px rgba(255,0,0,.6); }
  img { width: 100%; max-width: 720px; border: 3px solid #fff; border-radius: 4px; box-shadow: 0 0 30px rgba(255,0,0,.35); }
  a { display: inline-block; background: #ff2b2b; color: #120000; font-weight: 800; font-size: 1.3rem;
    padding: 16px 32px; border-radius: 10px; text-decoration: none; }
  p { margin: 0; color: #a0a0a0; font-size: .95rem; max-width: 34ch; }
  .logo { height: 44px; width: auto; border: 0; box-shadow: none; border-radius: 0; }
</style>
</head>
<body>
  <img class="logo" src="/marca/logo-tv1.png" alt="TV1" onerror="this.remove()">
  <h1>NOITE DOS MONSTROS</h1>
  <img src="/foto/${nome}" alt="Sua foto de monstro">
  <a href="/foto/${nome}?baixar=1" download="${nome}">⬇ BAIXAR FOTO</a>
  <p>Se o botão não funcionar, toque e segure na foto e escolha “Salvar imagem”.</p>
</body>
</html>`;
}

function servirFoto(req, res, url) {
  const [, tipo, nome] = url.pathname.match(/^\/(f|foto)\/([^/]+)$/) || [];
  if (!nome || !NOME_FOTO.test(nome)) { res.writeHead(404).end('nao encontrado'); return; }
  const arquivo = path.join(FOTOS, nome);
  fs.readFile(arquivo, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Foto não encontrada.'); return; }
    if (tipo === 'f') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(paginaFoto(nome)); return; }
    const cab = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' };
    if (url.searchParams.has('baixar')) cab['Content-Disposition'] = `attachment; filename="${nome}"`;
    res.writeHead(200, cab).end(data);
  });
}

const LIBERADOS_REDE = ['/vendor/Creepster-Regular.ttf', '/marca/logo-tv1.png'];
const doProprioPC =(req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && /^\/(f|foto)\//.test(url.pathname)) return servirFoto(req, res, url);
  // quem vem de outro aparelho da rede (celulares) só acessa as fotos, não o espelho
  if (!doProprioPC(req) && !LIBERADOS_REDE.includes(url.pathname)) { res.writeHead(403).end(); return; }

  if (req.method === 'POST' && url.pathname === '/api/foto') return salvarFoto(req, res);
  if (req.method === 'GET' && url.pathname === '/api/cenarios') {
    fs.readdir(CENARIOS, (err, arquivos) => {
      const lista = (arquivos || []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(JSON.stringify(lista));
    });
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }

  let p = decodeURIComponent(url.pathname);
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
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Espelho Zumbi rodando em http://localhost:${PORT}`);
  console.log(`Fotos serao salvas em: ${FOTOS}`);
  const base = enderecoDownload();
  if (base) console.log(`Celulares baixam as fotos por: ${base}/f/...  (precisam estar na mesma rede Wi-Fi)`);
  else console.log('ATENCAO: nenhuma rede encontrada; o QR code de download nao vai funcionar.');
});
