// Gerador de QR code (modo byte, correção de erro nível M, versões 1 a 10), sem dependências,
// para funcionar offline no evento. Uso: const q = gerarQR('http://...'); q.tamanho; q.escuro(x, y)
// Segue a norma ISO/IEC 18004 (mesma estrutura do gerador de referência de Project Nayuki).

const ECC_POR_BLOCO = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // nível M
const BLOCOS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];                     // nível M
const BITS_FORMATO_M = 0;

function multiplicar(x, y) {                     // multiplicação em GF(256), polinômio 0x11D
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisorRS(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}

function restoRS(dados, divisor) {
  const r = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= multiplicar(c, fator); });
  }
  return r;
}

function modulosDeDados(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const nAlin = Math.floor(ver / 7) + 2;
    n -= (25 * nAlin - 10) * nAlin - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const codewordsDeDados = (ver) => Math.floor(modulosDeDados(ver) / 8) - ECC_POR_BLOCO[ver] * BLOCOS[ver];

function posicoesAlinhamento(ver, tamanho) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const passo = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = tamanho - 7; r.length < n; p -= passo) r.splice(1, 0, p);
  return r;
}

function comCorrecao(dados, ver) {
  const nBlocos = BLOCOS[ver], ecc = ECC_POR_BLOCO[ver];
  const brutos = Math.floor(modulosDeDados(ver) / 8);
  const curtos = nBlocos - (brutos % nBlocos);
  const tamCurto = Math.floor(brutos / nBlocos);
  const divisor = divisorRS(ecc);
  const blocos = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const d = dados.slice(k, k + tamCurto - ecc + (i < curtos ? 0 : 1));
    k += d.length;
    const e = restoRS(d, divisor);
    if (i < curtos) d.push(0);
    blocos.push(d.concat(e));
  }
  const saida = [];
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => { if (i !== tamCurto - ecc || j >= curtos) saida.push(b[i]); });
  }
  return saida;
}

export function gerarQR(texto) {
  const bytes = [...new TextEncoder().encode(texto)];
  let ver = 1;
  while (ver <= 10 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > codewordsDeDados(ver) * 8) ver++;
  if (ver > 10) throw new Error('Texto longo demais para o QR code');
  const tamanho = ver * 4 + 17;

  // bits: modo byte (0100), contagem, dados, terminador e preenchimento
  const bits = [];
  const por = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  por(0b0100, 4);
  por(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach((b) => por(b, 8));
  const capacidade = codewordsDeDados(ver) * 8;
  por(0, Math.min(4, capacidade - bits.length));
  por(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacidade; p ^= 0xec ^ 0x11) por(p, 8);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const mod = Array.from({ length: tamanho }, () => new Array(tamanho).fill(false));
  const fixo = Array.from({ length: tamanho }, () => new Array(tamanho).fill(false));
  const marcar = (x, y, escuro) => { mod[y][x] = escuro; fixo[y][x] = true; };

  // padrões fixos: temporização, localizadores, alinhamento, formato e versão
  for (let i = 0; i < tamanho; i++) { marcar(6, i, i % 2 === 0); marcar(i, 6, i % 2 === 0); }
  [[3, 3], [tamanho - 4, 3], [3, tamanho - 4]].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < tamanho && y >= 0 && y < tamanho) marcar(x, y, d !== 2 && d !== 4);
      }
    }
  });
  const alin = posicoesAlinhamento(ver, tamanho);
  alin.forEach((ax, i) => alin.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === alin.length - 1) || (i === alin.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marcar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const formato = (mascara) => {
    const d = (BITS_FORMATO_M << 3) | mascara;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) marcar(8, i, bit(i));
    marcar(8, 7, bit(6)); marcar(8, 8, bit(7)); marcar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) marcar(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) marcar(tamanho - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) marcar(8, tamanho - 15 + i, bit(i));
    marcar(8, tamanho - 8, true);
  };
  formato(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const bit = ((b >>> i) & 1) === 1, a = tamanho - 11 + (i % 3), c = Math.floor(i / 3);
      marcar(a, c, bit); marcar(c, a, bit);
    }
  }

  // dados em zigue-zague, de baixo para cima, duas colunas por vez
  const cw = comCorrecao(dados, ver);
  let i = 0;
  for (let dir = tamanho - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let v = 0; v < tamanho; v++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j, subindo = ((dir + 1) & 2) === 0, y = subindo ? tamanho - 1 - v : v;
        if (!fixo[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
  }

  const MASCARAS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const aplicar = (m) => {
    for (let y = 0; y < tamanho; y++) for (let x = 0; x < tamanho; x++) if (!fixo[y][x] && MASCARAS[m](x, y)) mod[y][x] = !mod[y][x];
  };
  // penalidade simplificada (sequências longas, blocos 2x2 e equilíbrio claro/escuro) para escolher a máscara
  const penalidade = () => {
    let p = 0, escuros = 0;
    for (let a = 0; a < tamanho; a++) {
      let corL = null, runL = 0, corC = null, runC = 0;
      for (let b = 0; b < tamanho; b++) {
        const l = mod[a][b], c = mod[b][a];
        if (l) escuros++;
        if (l === corL) { runL++; if (runL === 5) p += 3; else if (runL > 5) p++; } else { corL = l; runL = 1; }
        if (c === corC) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; } else { corC = c; runC = 1; }
        if (a < tamanho - 1 && b < tamanho - 1 && l === mod[a][b + 1] && l === mod[a + 1][b] && l === mod[a + 1][b + 1]) p += 3;
      }
    }
    const total = tamanho * tamanho;
    return p + (Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1) * 10;
  };
  let melhor = 0, menor = Infinity;
  for (let m = 0; m < 8; m++) {
    aplicar(m); formato(m);
    const p = penalidade();
    if (p < menor) { menor = p; melhor = m; }
    aplicar(m);
  }
  aplicar(melhor); formato(melhor);

  return { tamanho, escuro: (x, y) => mod[y][x] };
}

// desenha o QR num canvas (com a margem branca obrigatória de 4 módulos)
export function desenharQR(canvas, texto, pixelsPorModulo = 8) {
  const q = gerarQR(texto);
  const total = q.tamanho + 8;
  canvas.width = canvas.height = total * pixelsPorModulo;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000';
  for (let y = 0; y < q.tamanho; y++) {
    for (let x = 0; x < q.tamanho; x++) {
      if (q.escuro(x, y)) g.fillRect((x + 4) * pixelsPorModulo, (y + 4) * pixelsPorModulo, pixelsPorModulo, pixelsPorModulo);
    }
  }
}
