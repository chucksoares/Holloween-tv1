// Monstros: cada um tem
//  - pintar(g): pinta a textura do rosto no espaço UV da malha (feita uma vez, 1024x1024);
//  - antes(ctx, R, a): desenha atrás/em volta do rosto (pelos, orelhas, cabelo...);
//  - depois(ctx, R, a): desenha por cima (olhos, presas, sangue...).
// "a" é o progresso da transformação (0 a 1). R é a geometria do rosto na tela (ver geometria()).
import { UV } from './malha.js';

export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const OLHO_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const OLHO_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const LABIOS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const BOCA = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const SOBR_A = [70, 63, 105, 66, 107];
const SOBR_A_INF = [46, 53, 52, 65, 55];
const SOBR_B = [300, 293, 334, 296, 336];
const SOBR_B_INF = [276, 283, 282, 295, 285];
const IRIS = [468, 473];

// ============================ utilidades ============================
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fase = (a, inicio, dur = 0.3) => clamp01((a - inicio) / dur);
const mix = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ===================== pintura no espaço UV (textura) =====================
export const S = 1024;
const U = (i) => [UV[i][0] * S, UV[i][1] * S];
const centroUV = (idx) => idx.map(U).reduce((s, p) => [s[0] + p[0] / idx.length, s[1] + p[1] / idx.length], [0, 0]);
const larguraOlhoUV = (olho) => dist(U(olho[0]), U(olho[8]));

function caminhoUV(g, idx, ex = 1, ey = ex) {
  const c = centroUV(idx);
  g.beginPath();
  idx.forEach((i, k) => {
    const [x, y] = U(i);
    const px = c[0] + (x - c[0]) * ex, py = c[1] + (y - c[1]) * ey;
    k ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.closePath();
}

function elipse(g, x, y, rx, ry, cor0, cor1 = null, ang = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(rx, ry);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, cor0);
  gr.addColorStop(1, cor1 ?? cor0.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// manchas orgânicas: ruído de baixa resolução ampliado e desfocado
function manchas(g, n, rgb, alfa, semente, pot = 1.6, desfoque = 6) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const d = ctx.createImageData(n, n);
  const r = mulberry32(semente);
  for (let i = 0; i < n * n; i++) {
    d.data[i * 4] = rgb[0]; d.data[i * 4 + 1] = rgb[1]; d.data[i * 4 + 2] = rgb[2];
    d.data[i * 4 + 3] = Math.pow(r(), pot) * 255 * alfa;
  }
  ctx.putImageData(d, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.filter = `blur(${desfoque}px)`;
  g.drawImage(c, 0, 0, S, S);
  g.restore();
}

function baseRosto(g, cor) {
  g.save();
  g.filter = `blur(${S * 0.025}px)`;
  g.fillStyle = cor;
  caminhoUV(g, FACE_OVAL, 0.93, 0.95);
  g.fill();
  g.restore();
  g.globalCompositeOperation = 'source-atop'; // tudo daqui pra frente fica dentro do rosto
}

function labios(g, cor) {
  g.save();
  g.fillStyle = cor;
  g.beginPath();
  LABIOS.forEach((i, k) => { const [x, y] = U(i); k ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath();
  BOCA.forEach((i, k) => { const [x, y] = U(i); k ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath();
  g.fill('evenodd');
  g.restore();
}

function sobrancelha(g, sup, inf, cor, engrossar = 0) {
  g.save();
  g.fillStyle = cor;
  g.filter = 'blur(2px)';
  g.beginPath();
  sup.forEach((i, k) => { const [x, y] = U(i); k ? g.lineTo(x, y - engrossar) : g.moveTo(x, y - engrossar); });
  [...inf].reverse().forEach((i) => { const [x, y] = U(i); g.lineTo(x, y + engrossar * 0.3); });
  g.closePath();
  g.fill();
  g.restore();
}

function olheira(g, olho, cor, escala = 1.2, desceY = 0.15) {
  const c = centroUV(olho), w = larguraOlhoUV(olho);
  elipse(g, c[0], c[1] + w * desceY, w * escala, w * escala * 0.75, cor);
}

function veiasUV(g, semente, sementes, cor, larg = 3) {
  const r = mulberry32(semente);
  g.save();
  g.strokeStyle = cor;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.filter = 'blur(0.6px)';
  const ramo = (x, y, ang, comp, w, prof) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang) * comp / 6;
      y += Math.sin(ang) * comp / 6;
      g.lineTo(x, y);
      if (prof > 0 && r() < 0.3) { g.stroke(); ramo(x, y, ang + (r() - 0.5) * 2, comp * 0.5, w * 0.6, prof - 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  sementes.forEach(([i, ang, comp]) => { const [x, y] = U(i); ramo(x, y, ang, comp * S, larg, 2); });
  g.restore();
}

function ferida(g, x, y, raio, semente) {
  const r = mulberry32(semente);
  const pts = Array.from({ length: 22 }, (_, k) => {
    const ang = (k / 22) * Math.PI * 2;
    const rr = raio * (0.65 + r() * 0.55);
    return [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.8];
  });
  const caminho = () => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); };
  g.save();
  g.filter = 'blur(6px)';
  g.fillStyle = 'rgba(70,20,25,0.8)';
  g.translate(x, y); g.scale(1.35, 1.35); g.translate(-x, -y);
  caminho(); g.fill();
  g.restore();
  g.save();
  const gr = g.createRadialGradient(x, y, 0, x, y, raio);
  gr.addColorStop(0, '#2a0306');
  gr.addColorStop(0.5, '#6e0d14');
  gr.addColorStop(1, '#8a3a2c');
  g.fillStyle = gr;
  g.filter = 'blur(1.5px)';
  caminho(); g.fill();
  for (let i = 0; i < 14; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(170,140,60,0.45)' : 'rgba(255,220,220,0.35)';
    g.beginPath();
    g.arc(x + (r() - 0.5) * raio, y + (r() - 0.5) * raio * 0.8, 1 + r() * raio * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function costura(g, p1, p2, cor = 'rgba(25,15,15,0.95)') {
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(110,20,30,0.85)';
  g.lineWidth = 7;
  g.filter = 'blur(1px)';
  g.beginPath(); g.moveTo(...p1); g.lineTo(...p2); g.stroke();
  g.strokeStyle = cor;
  g.lineWidth = 3;
  const n = [-(p2[1] - p1[1]), p2[0] - p1[0]];
  const nl = Math.hypot(...n);
  for (let k = 1; k <= 6; k++) {
    const [x, y] = mix(p1, p2, k / 7);
    const o = [(n[0] / nl) * 14, (n[1] / nl) * 14];
    g.beginPath(); g.moveTo(x - o[0], y - o[1]); g.lineTo(x + o[0], y + o[1]); g.stroke();
  }
  g.restore();
}

// rachaduras em brasa: o mesmo caminho (mesma semente) desenhado largo e escuro, depois fino e incandescente
function rachadurasUV(g, semente, sementes) {
  veiasUV(g, semente, sementes, 'rgba(25,3,0,0.9)', 11);
  veiasUV(g, semente, sementes, 'rgba(255,110,20,0.95)', 3.5);
}

// partes de caveira (usadas no cadáver)
function orbitaUV(g, olho, r) {
  const oc = centroUV(olho), w = larguraOlhoUV(olho);
  const cx = oc[0], cy = oc[1] - w * 0.12, rx = w * 0.95, ry = w * 0.82;
  const pts = Array.from({ length: 24 }, (_, k) => {
    const ang = (k / 24) * Math.PI * 2;
    const j = 0.9 + r() * 0.18;
    return [cx + Math.cos(ang) * rx * j, cy + Math.sin(ang) * ry * j];
  });
  g.save();
  g.filter = 'blur(3px)';
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
  gr.addColorStop(0, '#000');
  gr.addColorStop(0.75, '#0b0806');
  gr.addColorStop(1, '#2a221a');
  g.fillStyle = gr;
  g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.restore();
}

function narizCaveiraUV(g) {
  const n1 = U(98), n2 = U(327), ponta = U(195), base = mix(U(2), U(4), 0.3);
  g.save();
  g.fillStyle = '#0a0705';
  g.filter = 'blur(1.5px)';
  g.beginPath();
  g.moveTo(...ponta);
  g.quadraticCurveTo(n1[0] - 10, n1[1] - 30, n1[0], base[1]);
  g.quadraticCurveTo(base[0], base[1] + 18, n2[0], base[1]);
  g.quadraticCurveTo(n2[0] + 10, n2[1] - 30, ...ponta);
  g.fill();
  g.restore();
}

function dentesCaveiraUV(g) {
  labios(g, '#e3dccb');
  const ca = U(61), cb = U(291);
  const ext = [(cb[0] - ca[0]) * 0.28, (cb[1] - ca[1]) * 0.28];
  const p1 = [ca[0] - ext[0], ca[1] - ext[1]], p2 = [cb[0] + ext[0], cb[1] + ext[1]];
  const alt = dist(U(0), U(17)) * 0.75;
  g.save();
  g.strokeStyle = '#120c08';
  g.lineCap = 'round';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(...p1); g.quadraticCurveTo(...mix(U(13), U(14), 0.5), ...p2); g.stroke();
  g.lineWidth = 3.5;
  for (let k = 0; k <= 12; k++) {
    const [x, y] = mix(p1, p2, k / 12);
    const h = alt * (1 - Math.pow(Math.abs(k / 12 - 0.5) * 2, 3) * 0.6);
    g.beginPath(); g.moveTo(x, y - h * 0.55); g.lineTo(x, y + h * 0.55); g.stroke();
  }
  g.restore();
}

// --------------------------- texturas ---------------------------
function pintarPossuido(g) {
  baseRosto(g, '#8f8a80');
  manchas(g, 18, [55, 40, 45], 0.65, 101, 1.3, 14);
  manchas(g, 60, [120, 35, 30], 0.35, 102, 2, 3);
  manchas(g, 150, [30, 25, 25], 0.4, 103, 2.2, 1);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.55, S * 0.55, 'rgba(25,5,10,0)', 'rgba(25,5,10,0.85)');
  // maçãs do rosto fundas
  [[50, 172, 0.55], [280, 397, -0.55]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.45); elipse(g, p[0], p[1], S * 0.12, S * 0.05, 'rgba(30,10,15,0.7)', null, ang); });
  // olhos afundados e veias negras saindo deles
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(40,0,10,0.95)', 1.8, 0.05); olheira(g, o, 'rgba(0,0,0,1)', 1.1, 0.05); });
  veiasUV(g, 104, [[33, Math.PI, 0.14], [145, 1.9, 0.13], [159, -1.9, 0.12], [263, 0, 0.14], [374, 1.2, 0.13], [386, -1.2, 0.12]], 'rgba(15,0,8,0.92)', 5);
  veiasUV(g, 105, [[61, 2.4, 0.12], [291, 0.7, 0.12], [152, -1.6, 0.08]], 'rgba(20,0,10,0.85)', 3.5);
  // rachaduras em brasa descendo pela testa e pelo queixo
  rachadurasUV(g, 106, [[10, 1.7, 0.18], [54, 1.0, 0.14], [284, 2.1, 0.14], [172, -0.8, 0.12], [397, -2.3, 0.12]]);
  sobrancelha(g, SOBR_A, SOBR_A_INF, 'rgba(10,0,0,0.95)', 7);
  sobrancelha(g, SOBR_B, SOBR_B_INF, 'rgba(10,0,0,0.95)', 7);
  labios(g, 'rgba(20,0,5,1)');
  g.save();
  g.strokeStyle = 'rgba(90,0,10,0.9)'; g.lineWidth = 2;
  for (let k = 0; k < 9; k++) { const p = mix(U(61), U(291), 0.1 + k * 0.1); g.beginPath(); g.moveTo(p[0], p[1] - 12); g.lineTo(p[0] + 3, p[1] + 12); g.stroke(); }
  g.restore();
}

function pintarZumbi(g) {
  baseRosto(g, '#7f9670');
  manchas(g, 16, [90, 35, 80], 0.75, 11, 1.3, 16);
  manchas(g, 34, [150, 135, 50], 0.55, 12, 1.8, 7);
  manchas(g, 70, [60, 80, 40], 0.5, 14, 2, 3);
  manchas(g, 160, [35, 40, 25], 0.45, 13, 2.2, 1);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.55, S * 0.55, 'rgba(35,25,40,0)', 'rgba(35,25,40,0.8)');
  [[50, 0.6], [280, 0.6]].forEach(([i]) => { const p = mix(U(i), U(i === 50 ? 172 : 397), 0.45); elipse(g, p[0], p[1], S * 0.1, S * 0.06, 'rgba(45,20,40,0.8)', null, i === 50 ? 0.6 : -0.6); });
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(40,5,30,1)', 1.5); olheira(g, o, 'rgba(10,0,5,0.9)', 0.95, 0.05); });
  // apodrecimento em volta da boca e do nariz
  elipse(g, ...mix(U(0), U(17), 0.5), S * 0.13, S * 0.09, 'rgba(60,30,40,0.55)');
  veiasUV(g, 5, [[54, 1.2, 0.2], [284, 1.9, 0.2], [127, 0.4, 0.17], [356, 2.7, 0.17], [10, 1.6, 0.16], [172, -0.6, 0.14], [397, -2.5, 0.14]], 'rgba(45,10,60,0.9)', 6);
  veiasUV(g, 6, [[234, 0.2, 0.12], [454, 2.9, 0.12], [152, -1.6, 0.1]], 'rgba(90,10,30,0.7)', 3.5);
  const pf = mix(U(50), U(234), 0.35);
  ferida(g, pf[0], pf[1] + S * 0.04, S * 0.085, 7);
  const pm = mix(U(280), U(361), 0.4);
  ferida(g, pm[0], pm[1], S * 0.055, 8);
  const pt = mix(U(297), U(338), 0.5);
  ferida(g, pt[0], pt[1] + S * 0.02, S * 0.04, 9);
  costura(g, mix(U(67), U(109), 0.2), mix(U(9), U(107), 0.7));
  labios(g, 'rgba(40,20,35,1)');
  g.save();
  g.strokeStyle = 'rgba(20,5,10,0.8)'; g.lineWidth = 2;
  for (let k = 0; k < 9; k++) { const p = mix(U(61), U(291), 0.1 + k * 0.1); g.beginPath(); g.moveTo(p[0], p[1] - 12); g.lineTo(p[0] + 3, p[1] + 12); g.stroke(); }
  g.restore();
  elipse(g, ...U(98), 14, 10, 'rgba(10,0,0,0.8)');
  elipse(g, ...U(327), 14, 10, 'rgba(10,0,0,0.8)');
}

function pintarFreira(g) {
  baseRosto(g, '#ebe8e1');
  manchas(g, 30, [160, 155, 150], 0.4, 111, 1.5, 10);
  manchas(g, 100, [120, 115, 115], 0.25, 112, 2.2, 1.5);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.56, S * 0.56, 'rgba(40,35,45,0)', 'rgba(40,35,45,0.6)');
  // órbitas enormes e escuras
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(30,25,35,0.9)', 2.0, -0.05); olheira(g, o, 'rgba(5,0,8,1)', 1.25, 0); });
  // bochechas encovadas e laterais do nariz
  [[50, 172, 0.55], [280, 397, -0.55]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.4); elipse(g, p[0], p[1], S * 0.12, S * 0.045, 'rgba(50,40,55,0.65)', null, ang); });
  [[193, 209], [417, 429]].forEach(([a, b]) => { const p = mix(U(a), U(b), 0.5); elipse(g, p[0], p[1], S * 0.015, S * 0.06, 'rgba(60,50,65,0.5)'); });
  veiasUV(g, 113, [[54, 1.3, 0.1], [284, 1.8, 0.1], [127, 0.5, 0.08], [356, 2.6, 0.08]], 'rgba(90,70,110,0.45)', 2.5);
  labios(g, 'rgba(25,15,25,1)');
  // a boca escura rasga para os lados
  [[61, 50], [291, 280]].forEach(([canto, bochecha]) => {
    const q = mix(U(canto), U(bochecha), 0.35);
    g.save();
    g.strokeStyle = 'rgba(20,10,20,0.9)'; g.lineWidth = 10; g.lineCap = 'round'; g.filter = 'blur(2px)';
    g.beginPath(); g.moveTo(...U(canto)); g.lineTo(...q); g.stroke();
    g.restore();
  });
}

function pintarPalhaco(g) {
  baseRosto(g, '#efece4');
  // maquiagem branca suja e rachada
  manchas(g, 30, [150, 140, 125], 0.45, 61, 1.5, 9);
  manchas(g, 90, [90, 80, 70], 0.3, 62, 2.2, 1.5);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.57, S * 0.57, 'rgba(60,40,40,0)', 'rgba(60,40,40,0.55)');
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(60,20,25,0.75)', 1.45, 0); olheira(g, o, 'rgba(15,0,5,0.85)', 0.95, 0.05); });
  // linhas vermelhas cortando os olhos, da testa até a bochecha
  [OLHO_A, OLHO_B].forEach((o) => {
    const [cx, cy] = centroUV(o);
    const w = larguraOlhoUV(o);
    g.save();
    g.fillStyle = '#9e0a1c';
    g.filter = 'blur(1px)';
    g.beginPath();
    g.moveTo(cx, cy - w * 1.9);
    g.lineTo(cx + w * 0.12, cy);
    g.lineTo(cx, cy + w * 1.5);
    g.lineTo(cx - w * 0.12, cy);
    g.closePath();
    g.fill();
    g.restore();
  });
  // sobrancelhas pintadas, bem altas
  [SOBR_A, SOBR_B].forEach((sob) => {
    const p0 = U(sob[0]), p4 = U(sob[4]);
    g.save();
    g.strokeStyle = '#1a0a0a'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(p0[0], p0[1] - 30);
    g.quadraticCurveTo((p0[0] + p4[0]) / 2, Math.min(p0[1], p4[1]) - 110, p4[0], p4[1] - 25);
    g.stroke();
    g.restore();
  });
  // sorriso de sangue esticado até as maçãs do rosto, terminando em ponta
  labios(g, '#8e0618');
  [[61, 50], [291, 280]].forEach(([canto, bochecha]) => {
    const p = U(canto), q = mix(U(canto), U(bochecha), 0.95), m = mix(p, q, 0.5);
    g.save();
    g.fillStyle = '#8e0618';
    g.filter = 'blur(1.5px)';
    g.beginPath();
    g.moveTo(p[0], p[1] - 14);
    g.quadraticCurveTo(m[0], m[1] - 6, ...q);
    g.quadraticCurveTo(m[0], m[1] + 34, p[0], p[1] + 14);
    g.closePath();
    g.fill();
    g.restore();
  });
  // sangue escorrendo da boca
  const r = mulberry32(63);
  g.save();
  g.strokeStyle = g.fillStyle = 'rgba(110,5,20,0.9)';
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const [x, y] = mix(U(61), U(291), 0.08 + k * 0.14);
    const comp = S * (0.03 + r() * 0.07);
    g.lineWidth = 5 + r() * 5;
    g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + (r() - 0.5) * 6, y + comp); g.stroke();
    g.beginPath(); g.arc(x, y + comp, g.lineWidth * 0.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // nariz vermelho-escuro
  const nw = dist(U(98), U(327));
  elipse(g, ...U(4), nw * 0.6, nw * 0.55, 'rgba(150,10,25,1)', 'rgba(120,5,20,0.95)');
  elipse(g, U(4)[0] - nw * 0.15, U(4)[1] - nw * 0.2, nw * 0.12, nw * 0.08, 'rgba(255,255,255,0.5)');
}

function pintarNosferatu(g) {
  baseRosto(g, '#c4c6b4');
  manchas(g, 22, [120, 125, 105], 0.5, 121, 1.4, 12);
  manchas(g, 90, [80, 85, 70], 0.3, 122, 2.2, 1.5);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.55, S * 0.55, 'rgba(30,35,30,0)', 'rgba(30,35,30,0.75)');
  // sem sobrancelhas, órbitas fundas e arroxeadas
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(70,30,50,0.85)', 1.8, 0.05); olheira(g, o, 'rgba(15,0,8,1)', 1.15, 0.05); });
  // bochechas encovadas e sombra ao longo do nariz comprido
  [[50, 172, 0.55], [280, 397, -0.55]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.45); elipse(g, p[0], p[1], S * 0.12, S * 0.05, 'rgba(40,40,35,0.7)', null, ang); });
  [[193, 209], [417, 429]].forEach(([a, b]) => { const p = mix(U(a), U(b), 0.5); elipse(g, p[0], p[1], S * 0.015, S * 0.06, 'rgba(50,50,45,0.5)'); });
  veiasUV(g, 123, [[10, 1.6, 0.16], [54, 1.0, 0.14], [284, 2.1, 0.14], [127, 0.4, 0.12], [356, 2.7, 0.12]], 'rgba(50,60,110,0.75)', 4);
  labios(g, 'rgba(45,25,35,1)');
}

function pintarCadaver(g) {
  // lado A: carne podre
  baseRosto(g, '#868b74');
  manchas(g, 16, [90, 40, 70], 0.7, 131, 1.3, 16);
  manchas(g, 40, [140, 125, 60], 0.5, 132, 1.8, 6);
  manchas(g, 140, [35, 35, 25], 0.45, 133, 2.2, 1);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.55, S * 0.55, 'rgba(35,25,30,0)', 'rgba(35,25,30,0.8)');
  olheira(g, OLHO_A, 'rgba(40,5,30,1)', 1.5);
  olheira(g, OLHO_A, 'rgba(10,0,5,0.9)', 0.95, 0.05);
  veiasUV(g, 134, [[54, 1.2, 0.2], [127, 0.4, 0.17], [172, -0.6, 0.14]], 'rgba(45,10,60,0.9)', 6);
  const pf = mix(U(50), U(234), 0.35);
  ferida(g, pf[0], pf[1] + S * 0.04, S * 0.08, 135);
  labios(g, 'rgba(40,20,35,1)');
  // lado B: a pele foi arrancada até o osso, com um rasgo irregular no meio do rosto
  const r = mulberry32(136);
  const corte = Array.from({ length: 26 }, (_, k) => [S * (0.5 + (r() - 0.5) * 0.07), S * (k / 25)]);
  const metade = () => { g.beginPath(); g.moveTo(S, 0); corte.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(S, S); g.closePath(); };
  g.save();
  g.filter = 'blur(5px)';
  g.fillStyle = 'rgba(120,10,20,0.95)';
  g.translate(-S * 0.03, 0);
  metade(); g.fill();
  g.restore();
  g.save();
  metade(); g.clip();
  g.fillStyle = '#e2dac7';
  g.fillRect(0, 0, S, S);
  manchas(g, 36, [170, 150, 120], 0.45, 137, 1.6, 8);
  manchas(g, 120, [110, 95, 80], 0.3, 138, 2.5, 1);
  elipse(g, c[0], c[1], S * 0.56, S * 0.56, 'rgba(60,45,35,0)', 'rgba(60,45,35,0.6)');
  orbitaUV(g, OLHO_B, r);
  narizCaveiraUV(g);
  const p = mix(U(280), U(397), 0.45);
  elipse(g, p[0], p[1], S * 0.12, S * 0.045, 'rgba(40,30,25,0.6)', null, -0.55);
  dentesCaveiraUV(g);
  g.strokeStyle = 'rgba(30,22,16,0.85)'; g.lineWidth = 2.5; g.lineJoin = 'round';
  let [x, y] = mix(U(10), U(338), 0.5);
  g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < 7; k++) { x += (r() - 0.3) * 30; y += 18 + r() * 14; g.lineTo(x, y); }
  g.stroke();
  g.restore();
}

// ===================== geometria do rosto na tela =====================
// lm: pontos normalizados do MediaPipe; W/H: tamanho da tela. Tudo já espelhado.
export function geometria(lm, W, H) {
  const P = (i) => [(1 - lm[i].x) * W, lm[i].y * H];
  const L = P(234), R = P(454), T = P(10), B = P(152);
  let ex = [R[0] - L[0], R[1] - L[1]];
  if (ex[0] < 0) ex = [-ex[0], -ex[1]];
  const ey = [B[0] - T[0], B[1] - T[1]];
  const C = mix(T, B, 0.5);
  const fw = Math.hypot(...ex), fh = Math.hypot(...ey);
  const dir = [ey[0] / fh, ey[1] / fh];
  const olho = (idx) => {
    const pts = idx.map(P);
    const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
    const w = dist(pts[0], pts[8]);
    let iris = c;
    if (lm.length > 473) iris = IRIS.map(P).sort((p, q) => dist(p, c) - dist(q, c))[0];
    const abertura = dist(P(idx[4]), P(idx[12])) / Math.max(1, w);
    return { idx, c, w, iris, abertura };
  };
  return {
    P, ex, ey, C, fw, fh, dir,
    local: (u, v) => [C[0] + u * ex[0] + v * ey[0], C[1] + u * ex[1] + v * ey[1]],
    olhos: [olho(OLHO_A), olho(OLHO_B)],
    boca: dist(P(13), P(14)) / fh,
  };
}

function caminhoTela(ctx, R, idx, escala = 1, escalaY = escala) {
  const pts = idx.map(R.P);
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
  ctx.beginPath();
  pts.forEach(([x, y], k) => {
    const px = c[0] + (x - c[0]) * escala, py = c[1] + (y - c[1]) * escalaY;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.closePath();
}

// ------------------------- olhos -------------------------
function olhoLeitoso(ctx, R, o, a) {
  if (a <= 0) return;
  ctx.save();
  caminhoTela(ctx, R, o.idx);
  ctx.clip();
  const gi = ctx.createRadialGradient(o.iris[0], o.iris[1], 0, o.iris[0], o.iris[1], o.w * 0.7);
  gi.addColorStop(0, `rgba(238,242,232,${0.97 * a})`);
  gi.addColorStop(0.45, `rgba(205,214,198,${0.95 * a})`);
  gi.addColorStop(1, `rgba(150,140,115,${0.92 * a})`);
  ctx.fillStyle = gi;
  ctx.fillRect(o.c[0] - o.w, o.c[1] - o.w, o.w * 2, o.w * 2);
  ctx.fillStyle = `rgba(140,150,140,${0.35 * a})`;
  ctx.beginPath(); ctx.arc(o.iris[0], o.iris[1], o.w * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(170,20,25,${0.6 * a})`;
  ctx.lineWidth = Math.max(1, o.w * 0.025);
  [o.idx[0], o.idx[8]].forEach((canto) => {
    const p = R.P(canto);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.quadraticCurveTo(p[0] + (o.iris[0] - p[0]) * 0.4, p[1] + (k - 1) * o.w * 0.12,
        p[0] + (o.iris[0] - p[0]) * 0.65, p[1] + (k - 1) * o.w * 0.06 + (o.iris[1] - p[1]) * 0.5);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function olhoBrilhante(ctx, R, o, a, cor, pupila, t) {
  if (a <= 0) return;
  const raio = o.w * 0.24;
  ctx.save();
  caminhoTela(ctx, R, o.idx);
  ctx.clip();
  ctx.fillStyle = `rgba(30,10,10,${0.35 * a})`;
  ctx.fillRect(o.c[0] - o.w, o.c[1] - o.w, o.w * 2, o.w * 2);
  const gi = ctx.createRadialGradient(o.iris[0], o.iris[1], 0, o.iris[0], o.iris[1], raio);
  gi.addColorStop(0, `rgba(255,255,220,${a})`);
  gi.addColorStop(0.35, cor.replace('A', a));
  gi.addColorStop(1, cor.replace('A', a * 0.85).replace(/rgba\((\d+),(\d+),(\d+)/, (_, r, g, b) => `rgba(${r * 0.4 | 0},${g * 0.4 | 0},${b * 0.4 | 0}`));
  ctx.fillStyle = gi;
  ctx.beginPath(); ctx.arc(o.iris[0], o.iris[1], raio, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(0,0,0,${0.95 * a})`;
  ctx.beginPath();
  if (pupila === 'fenda') ctx.ellipse(o.iris[0], o.iris[1], raio * 0.18, raio * 0.85, 0, 0, Math.PI * 2);
  else ctx.arc(o.iris[0], o.iris[1], raio * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // brilho saindo do olho
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulsa = 0.8 + 0.2 * Math.sin(t * 5);
  const gb = ctx.createRadialGradient(o.iris[0], o.iris[1], 0, o.iris[0], o.iris[1], o.w * 0.9);
  gb.addColorStop(0, cor.replace('A', 0.55 * a * pulsa));
  gb.addColorStop(1, cor.replace('A', 0));
  ctx.fillStyle = gb;
  ctx.beginPath(); ctx.arc(o.iris[0], o.iris[1], o.w * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function olhoVazio(ctx, R, o, a, brilho = null) {
  if (a <= 0) return;
  ctx.save();
  ctx.filter = `blur(${Math.max(1, o.w * 0.06)}px)`;
  caminhoTela(ctx, R, o.idx, 1.35, 1.9);
  ctx.fillStyle = `rgba(0,0,0,${0.97 * a})`;
  ctx.fill();
  ctx.restore();
  if (brilho) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(o.iris[0], o.iris[1], 0, o.iris[0], o.iris[1], o.w * 0.18);
    g.addColorStop(0, brilho.replace('A', a));
    g.addColorStop(1, brilho.replace('A', 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.iris[0], o.iris[1], o.w * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ------------------------- dentes e sangue -------------------------
const DENTE_BRANCO = ['#d9d2bd', '#fbf8ee', '#ffffff'];
const DENTE_PODRE = ['#5c4a2a', '#b8a670', '#e6dcb4'];
const DENTE_RATO = ['#8a7a4a', '#d8cfa0', '#f2ecd0'];

function presa(ctx, R, base, comp, larg, sentido = 1, cores = DENTE_BRANCO) {
  const [x, y] = base;
  const d = [R.dir[0] * sentido, R.dir[1] * sentido];
  const n = [-d[1], d[0]];
  const ponta = [x + d[0] * comp, y + d[1] * comp];
  ctx.save();
  const g = ctx.createLinearGradient(x, y, ponta[0], ponta[1]);
  g.addColorStop(0, cores[0]);
  g.addColorStop(0.6, cores[1]);
  g.addColorStop(1, cores[2]);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(60,40,30,0.7)';
  ctx.lineWidth = Math.max(1, larg * 0.08);
  ctx.beginPath();
  ctx.moveTo(x - n[0] * larg / 2, y - n[1] * larg / 2);
  ctx.quadraticCurveTo(x - n[0] * larg * 0.35 + d[0] * comp * 0.6, y - n[1] * larg * 0.35 + d[1] * comp * 0.6, ...ponta);
  ctx.quadraticCurveTo(x + n[0] * larg * 0.2 + d[0] * comp * 0.5, y + n[1] * larg * 0.2 + d[1] * comp * 0.5, x + n[0] * larg / 2, y + n[1] * larg / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// boca aberta: fileiras de dentes afiados; boca fechada: só as duas presas
const DENTES_CIMA = [80, 81, 82, 13, 312, 311, 310];
const DENTES_BAIXO = [88, 178, 87, 14, 317, 402, 318];

function dentes(ctx, R, k, cores = DENTE_BRANCO, comp = 0.05, larg = 0.028) {
  if (k <= 0) return;
  if (R.boca > 0.03) {
    DENTES_CIMA.forEach((i) => presa(ctx, R, R.P(i), R.fh * comp * k, R.fw * larg, 1, cores));
    DENTES_BAIXO.forEach((i) => presa(ctx, R, R.P(i), R.fh * comp * 0.8 * k, R.fw * larg, -1, cores));
  } else {
    [81, 311].forEach((i) => presa(ctx, R, R.P(i), R.fh * comp * 1.4 * k, R.fw * larg * 1.2, 1, cores));
  }
}

function gota(ctx, R, ponto, comp, larg, k, t, i) {
  if (k <= 0) return;
  const [x, y] = R.P(ponto);
  const c = R.fh * comp * (1 - (1 - k) ** 2) * (1 + 0.06 * Math.sin(t * 1.3 + i * 2));
  const w = R.fw * larg;
  const x2 = x + R.dir[0] * c, y2 = y + R.dir[1] * c;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5e0009';
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.fillStyle = '#5e0009';
  ctx.beginPath(); ctx.arc(x2, y2, w * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,130,130,0.4)';
  ctx.lineWidth = w * 0.22;
  ctx.beginPath(); ctx.moveTo(x - w * 0.2, y); ctx.lineTo(x2 - w * 0.2, y2 - w * 0.3); ctx.stroke();
  ctx.restore();
}

// ------------------------- chifres, véu, cabelos -------------------------
// chifres de demônio saindo da testa
function chifres(ctx, R, a) {
  if (a <= 0.25) return;
  const k = fase(a, 0.25, 0.5);
  const curva = (p0, c, p1, s) => [0, 1].map((e) => (1 - s) ** 2 * p0[e] + 2 * (1 - s) * s * c[e] + s * s * p1[e]);
  [-1, 1].forEach((lado) => {
    const pt = (du, dv) => R.local(lado * (0.2 + du * k), -0.38 + dv * k);
    const b1 = pt(-0.09, 0.03), b2 = pt(0.09, 0.03);
    const cExt = pt(0.34, -0.22), ponta = pt(0.12, -0.62), cInt = pt(0.06, -0.24);
    ctx.save();
    const g = ctx.createLinearGradient(...mix(b1, b2, 0.5), ...ponta);
    g.addColorStop(0, '#7a2a18');
    g.addColorStop(0.55, '#3a140c');
    g.addColorStop(1, '#0a0303');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(1, R.fw * 0.005);
    ctx.beginPath();
    ctx.moveTo(...b2);
    ctx.quadraticCurveTo(...cExt, ...ponta);
    ctx.quadraticCurveTo(...cInt, ...b1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // anéis do chifre
    ctx.strokeStyle = 'rgba(10,5,3,0.55)';
    for (let j = 1; j < 8; j++) {
      ctx.beginPath();
      ctx.moveTo(...curva(b2, cExt, ponta, j / 8));
      ctx.lineTo(...curva(b1, cInt, ponta, j / 8));
      ctx.stroke();
    }
    ctx.restore();
  });
}

// véu preto e touca branca da freira (desenhados só fora do rosto)
function veuFreira(ctx, R, a) {
  if (a <= 0.1) return;
  const k = fase(a, 0.1, 0.5);
  const contorno = (e) => {
    FACE_OVAL.map(R.P).forEach(([x, y], i) => {
      const px = R.C[0] + (x - R.C[0]) * e, py = R.C[1] + (y - R.C[1]) * e;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  };
  const pts = [[0, -0.8], [0.6, -0.62], [0.88, -0.05], [1.0, 0.7], [1.3, 1.7], [-1.3, 1.7], [-1.0, 0.7], [-0.88, -0.05], [-0.6, -0.62]]
    .map(([u, v]) => R.local(u, v));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.beginPath();
  ctx.moveTo(...mix(pts[pts.length - 1], pts[0], 0.5));
  pts.forEach((p, i) => ctx.quadraticCurveTo(...p, ...mix(p, pts[(i + 1) % pts.length], 0.5)));
  ctx.closePath();
  contorno(0.98);
  const gv = ctx.createLinearGradient(...R.local(0, -0.8), ...R.local(0, 1.2));
  gv.addColorStop(0, '#1a181e');
  gv.addColorStop(1, '#050407');
  ctx.fillStyle = gv;
  ctx.fill('evenodd');
  ctx.beginPath();
  contorno(1.2);
  contorno(0.98);
  ctx.fillStyle = '#dcd8ce';
  ctx.fill('evenodd');
  ctx.restore();
}

// cabelo crespo do palhaço: muitos cachinhos (espirais) formando dois tufos ao lado da cabeça
const rndCab = mulberry32(91);
const CACHOS = Array.from({ length: 260 }, () => {
  const ang = rndCab() * Math.PI * 2, raio = Math.sqrt(rndCab());
  return { u: 0.66 + Math.cos(ang) * raio * 0.17, v: -0.2 + Math.sin(ang) * raio * 0.26, r: 0.018 + rndCab() * 0.022, tom: rndCab(), giro: rndCab() * 6 };
}).sort((p, q) => p.r - q.r);
const TONS_CABELO = ['#d9400f', '#b8300a', '#9e2808', '#e85a1a', '#7a1e05'];

function cabeloPalhaco(ctx, R, a) {
  if (a <= 0.15) return;
  const k = fase(a, 0.15, 0.5);
  ctx.save();
  ctx.lineCap = 'round';
  [-1, 1].forEach((lado) => {
    // sombra/volume do tufo
    const centro = R.local(lado * (0.5 + 0.16 * k), -0.2);
    const gs = ctx.createRadialGradient(...centro, 0, ...centro, R.fw * 0.24 * k);
    gs.addColorStop(0, 'rgba(90,15,5,0.95)');
    gs.addColorStop(1, 'rgba(90,15,5,0)');
    ctx.fillStyle = gs;
    ctx.beginPath(); ctx.arc(...centro, R.fw * 0.24 * k, 0, Math.PI * 2); ctx.fill();
    CACHOS.forEach((c) => {
      const [x, y] = R.local(lado * (0.5 + (c.u - 0.5) * k), c.v * (0.6 + 0.4 * k));
      const raio = c.r * R.fw * k;
      ctx.strokeStyle = TONS_CABELO[Math.floor(c.tom * TONS_CABELO.length)];
      ctx.lineWidth = Math.max(1.2, raio * 0.45);
      ctx.beginPath();
      for (let s = 0; s <= 14; s++) {
        const ang = c.giro + s * 0.75, rr = raio * (0.3 + s / 20);
        const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
        s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    });
  });
  ctx.restore();
}

// orelhas pontudas de morcego do nosferatu, crescendo das laterais da cabeça
function orelhasNosferatu(ctx, R, a) {
  if (a <= 0.2) return;
  const k = fase(a, 0.2, 0.5);
  [-1, 1].forEach((lado) => {
    const pt = (u, v) => R.local(lado * u, v);
    const b1 = pt(0.46, -0.14), b2 = pt(0.46, 0.22);
    const ponta = mix(pt(0.55, -0.1), pt(0.78, -0.5), k);
    const cSup = mix(pt(0.5, -0.14), pt(0.58, -0.28), k), cInf = mix(pt(0.55, 0.1), pt(0.76, 0.02), k);
    const forma = (enc) => {
      const c = mix(b1, b2, 0.5), f = (p) => mix(p, c, enc);
      ctx.beginPath();
      ctx.moveTo(...f(b1));
      ctx.quadraticCurveTo(...f(cSup), ...mix(ponta, c, enc * 0.6));
      ctx.quadraticCurveTo(...f(cInf), ...f(b2));
      ctx.closePath();
    };
    ctx.save();
    const g = ctx.createLinearGradient(...mix(b1, b2, 0.5), ...ponta);
    g.addColorStop(0, '#8e9080');
    g.addColorStop(1, '#cfd0c0');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(30,30,25,0.6)';
    ctx.lineWidth = Math.max(1, R.fw * 0.004);
    forma(0);
    ctx.fill();
    ctx.stroke();
    // parte de dentro da orelha
    ctx.filter = `blur(${Math.max(1, R.fw * 0.008)}px)`;
    ctx.fillStyle = 'rgba(95,55,65,0.75)';
    forma(0.35);
    ctx.fill();
    ctx.restore();
  });
}

// ===================== deformação do formato do rosto =====================
// Cada monstro define um deslocamento (du, dv) para cada ponto do rosto, a partir da posição
// dele no mapa UV (u: 0 = lado A, 1 = lado B; v: 0.1 = topo da testa, 0.95 = queixo).
// du é medido em larguras de rosto e dv em alturas de rosto. Como é calculado sobre os pontos
// reais da pessoa, os traços e expressões dela continuam lá; só o formato muda.
const gs = (u, v, cu, cv, su, sv) => Math.exp(-(((u - cu) / su) ** 2 + ((v - cv) / sv) ** 2));
const suave = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const OLHOS_UV = [[0.345, 0.385], [0.655, 0.385]];

function ampliarOlhos(u, v, fator, alongarY = 1, desce = 0) {
  let du = 0, dv = 0;
  OLHOS_UV.forEach(([cu, cv]) => {
    const w = gs(u, v, cu, cv, 0.1, 0.075);
    du += (u - cu) * fator * w;
    dv += (v - cv) * fator * alongarY * w + desce * w;
  });
  return [du, dv];
}

const DEFORMACOES = {
  possuido(u, v) {
    const l = u - 0.5, sl = Math.sign(l), al = Math.abs(l);
    let du = 0, dv = 0;
    // sobrancelhas baixas e juntas, cantos externos para cima (cara de fúria)
    dv += 0.035 * gs(al, v, 0.12, 0.28, 0.1, 0.05);
    du -= sl * 0.03 * gs(al, v, 0.15, 0.28, 0.1, 0.05);
    dv -= 0.025 * gs(al, v, 0.3, 0.3, 0.07, 0.05);
    // bochechas fundas e maçãs salientes
    du -= sl * 0.05 * gs(al, v, 0.3, 0.66, 0.12, 0.1);
    du += sl * 0.03 * gs(al, v, 0.33, 0.5, 0.1, 0.06);
    // sorriso maligno: cantos da boca para fora e para cima
    [[0.382, -1], [0.618, 1]].forEach(([cu, lado]) => {
      const w = gs(u, v, cu, 0.695, 0.07, 0.05);
      du += lado * 0.05 * w;
      dv -= 0.03 * w;
    });
    // queixo comprido
    const queixo = suave(0.75, 0.97, v);
    dv += 0.05 * queixo;
    du -= l * 0.2 * queixo;
    return [du, dv];
  },
  zumbi(u, v) {
    const l = u - 0.5, sl = Math.sign(l), al = Math.abs(l);
    let du = 0, dv = 0;
    // mandíbula caída e torta (o lado A cai mais)
    const baixo = suave(0.62, 0.95, v);
    dv += baixo * (0.05 + 0.08 * (0.5 - u));
    du += 0.035 * baixo;
    // canto da boca e olho do lado A caídos
    dv += 0.035 * gs(u, v, 0.38, 0.7, 0.06, 0.05);
    dv += 0.03 * gs(u, v, 0.32, 0.4, 0.07, 0.035);
    // bochechas murchas e têmporas fundas
    du -= sl * 0.035 * gs(al, v, 0.3, 0.62, 0.12, 0.1);
    du -= sl * 0.02 * gs(al, v, 0.45, 0.35, 0.08, 0.12);
    return [du, dv];
  },
  freira(u, v) {
    const sl = Math.sign(u - 0.5), al = Math.abs(u - 0.5);
    let [du, dv] = ampliarOlhos(u, v, 0.45, 1.3);
    // bochechas encovadas e cantos da boca caídos
    du -= sl * 0.045 * gs(al, v, 0.3, 0.66, 0.12, 0.1);
    dv += 0.03 * gs(al, v, 0.12, 0.7, 0.06, 0.05);
    return [du, dv];
  },
  palhaco(u, v) {
    const l = u - 0.5, al = Math.abs(l);
    let [du, dv] = ampliarOlhos(u, v, 0.35);
    // sorriso esticado: cantos da boca para fora e para cima
    [[0.382, -1], [0.618, 1]].forEach(([cu, lado]) => {
      const w = gs(u, v, cu, 0.695, 0.07, 0.05);
      du += lado * 0.07 * w;
      dv -= 0.05 * w;
    });
    dv -= 0.03 * gs(al, v, 0.25, 0.58, 0.12, 0.1);
    // testa grande e arredondada
    dv -= 0.06 * suave(0.3, 0.1, v);
    du += l * 0.12 * suave(0.35, 0.1, v);
    return [du, dv];
  },
  nosferatu(u, v) {
    const l = u - 0.5, sl = Math.sign(l), al = Math.abs(l);
    let [du, dv] = ampliarOlhos(u, v, 0.25, 1.2);
    // cabeça pontuda: a testa sobe e afina
    const testa = suave(0.32, 0.1, v);
    dv -= 0.07 * testa;
    du -= l * 0.25 * testa;
    // bochechas bem encovadas
    du -= sl * 0.06 * gs(al, v, 0.3, 0.64, 0.13, 0.11);
    // nariz comprido e afilado
    dv += 0.035 * gs(u, v, 0.5, 0.56, 0.05, 0.06);
    du -= l * 0.35 * gs(u, v, 0.5, 0.55, 0.08, 0.06);
    // queixo estreito
    const baixo = suave(0.7, 0.97, v);
    du -= l * 0.2 * baixo;
    dv += 0.03 * baixo;
    return [du, dv];
  },
  caveira(u, v) {
    const l = u - 0.5, sl = Math.sign(l), al = Math.abs(l);
    let [du, dv] = ampliarOlhos(u, v, 0.55);
    // bochechas bem fundas, rosto estreito embaixo, nariz menor
    du -= sl * 0.06 * gs(al, v, 0.3, 0.64, 0.14, 0.12);
    const baixo = suave(0.6, 0.95, v);
    du -= l * 0.25 * baixo;
    dv += 0.03 * baixo;
    du -= l * 0.4 * gs(u, v, 0.5, 0.58, 0.1, 0.05);
    return [du, dv];
  },
  // metade zumbi (lado A), metade caveira (lado B)
  cadaver(u, v) {
    const w = suave(0.44, 0.56, u);
    const z = DEFORMACOES.zumbi(u, v), c = DEFORMACOES.caveira(u, v);
    return [z[0] * (1 - w) + c[0] * w, z[1] * (1 - w) + c[1] * w];
  },
};

// desloca os pontos reais do rosto (lm normalizado, não espelhado) conforme o monstro e a força k (0 a 1)
export function deformarRosto(lm, monstro, k, W, H) {
  const D = monstro.deslocamentos;
  if (!D || k <= 0) return lm;
  const ex = [(lm[454].x - lm[234].x) * W, (lm[454].y - lm[234].y) * H];
  const ey = [(lm[152].x - lm[10].x) * W, (lm[152].y - lm[10].y) * H];
  const saida = new Array(lm.length);
  for (let i = 0; i < lm.length; i++) {
    // íris (468+) acompanham o olho mais próximo
    const j = i < 468 ? i : (Math.abs(lm[i].x - lm[33].x) < Math.abs(lm[i].x - lm[263].x) ? 159 : 386);
    const du = D[j * 2] * k, dv = D[j * 2 + 1] * k;
    saida[i] = { x: lm[i].x + (du * ex[0] + dv * ey[0]) / W, y: lm[i].y + (du * ex[1] + dv * ey[1]) / H, z: lm[i].z };
  }
  return saida;
}

// ============================ os monstros ============================
const GOTAS_ZUMBI = [
  { ponto: 61, inicio: 0.3, comp: 0.26, larg: 0.018 },
  { ponto: 291, inicio: 0.45, comp: 0.18, larg: 0.014 },
  { ponto: 17, inicio: 0.6, comp: 0.34, larg: 0.022 },
  { ponto: 374, inicio: 0.65, comp: 0.2, larg: 0.009 },
  { ponto: 145, inicio: 0.78, comp: 0.22, larg: 0.009 },
];

export const MONSTROS = [
  {
    id: 'possuido', nome: 'POSSUÍDO', emoji: '😈', cor: '#ff3b1f', brilho: [1.0, 0.3, 0.0],
    frase: 'ELE ESTÁ DENTRO DE VOCÊ', som: 'demonio',
    filtro: (a) => `saturate(${1 - 0.5 * a}) contrast(${1 + 0.3 * a}) brightness(${1 - 0.25 * a}) sepia(${0.35 * a}) hue-rotate(${-25 * a}deg)`,
    pintar: pintarPossuido,
    antes(ctx, R, a) { chifres(ctx, R, a); },
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoVazio(ctx, R, o, fase(a, 0.3, 0.4), 'rgba(255,40,0,A)'));
      dentes(ctx, R, fase(a, 0.5, 0.35), DENTE_PODRE);
      [145, 374].forEach((p, i) => gota(ctx, R, p, 0.28, 0.012, fase(a, 0.55 + i * 0.1, 0.4), t, i));
      gota(ctx, R, 17, 0.3, 0.02, fase(a, 0.7, 0.3), t, 3);
    },
  },
  {
    id: 'zumbi', nome: 'ZUMBI', emoji: '🧟', cor: '#8dff5a', brilho: [0.35, 1.0, 0.2],
    frase: 'VOCÊ FOI INFECTADO', som: 'rosnado',
    filtro: (a) => `saturate(${1 - 0.55 * a}) contrast(${1 + 0.2 * a}) brightness(${1 - 0.15 * a})`,
    pintar: pintarZumbi,
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoLeitoso(ctx, R, o, fase(a, 0.3, 0.4)));
      if (R.boca > 0.03) dentes(ctx, R, fase(a, 0.55, 0.35), DENTE_PODRE, 0.04, 0.03);
      GOTAS_ZUMBI.forEach((g, i) => gota(ctx, R, g.ponto, g.comp, g.larg, fase(a, g.inicio, 1 - g.inicio), t, i));
    },
  },
  {
    id: 'freira', nome: 'A FREIRA', emoji: '🕯️', cor: '#ffd23b', brilho: [1.0, 0.85, 0.2],
    frase: 'REZE... SE PUDER', som: 'grito',
    filtro: (a) => `saturate(${1 - 0.8 * a}) contrast(${1 + 0.3 * a}) brightness(${1 - 0.2 * a})`,
    pintar: pintarFreira,
    antes(ctx, R, a) { veuFreira(ctx, R, a); },
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.4, 0.4), 'rgba(255,210,40,A)', 'ponto', t));
      dentes(ctx, R, fase(a, 0.5, 0.35), DENTE_BRANCO, 0.06, 0.03);
    },
  },
  {
    id: 'palhaco', nome: 'PALHAÇO', emoji: '🤡', cor: '#ff7a1a', brilho: [1.0, 0.35, 0.05],
    frase: 'AQUI TODOS FLUTUAM', som: 'risada',
    filtro: (a) => `saturate(${1 - 0.3 * a}) contrast(${1 + 0.3 * a}) brightness(${1 - 0.2 * a})`,
    pintar: pintarPalhaco,
    antes(ctx, R, a) { cabeloPalhaco(ctx, R, a); },
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.45, 0.4), 'rgba(255,170,0,A)', 'ponto', t));
      dentes(ctx, R, fase(a, 0.55, 0.35));
      [[61, 0.6], [291, 0.68], [17, 0.75]].forEach(([p, ini], i) => gota(ctx, R, p, 0.22, 0.014, fase(a, ini, 1 - ini), t, i));
    },
  },
  {
    id: 'nosferatu', nome: 'NOSFERATU', emoji: '🦇', cor: '#ff1f3d', brilho: [1.0, 0.1, 0.2],
    frase: 'SEU SANGUE É MEU', som: 'morcegos',
    filtro: (a) => `saturate(${1 - 0.85 * a}) contrast(${1 + 0.35 * a}) brightness(${1 - 0.2 * a})`,
    pintar: pintarNosferatu,
    antes(ctx, R, a) { orelhasNosferatu(ctx, R, a); },
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.35, 0.4), 'rgba(230,20,40,A)', 'fenda', t));
      // dentes de rato: dois incisivos compridos no meio da boca
      const k = fase(a, 0.5, 0.35);
      if (R.boca > 0.03) dentes(ctx, R, k, DENTE_PODRE, 0.035, 0.022);
      if (k > 0) [82, 312].forEach((i) => presa(ctx, R, R.P(i), R.fh * 0.11 * k, R.fw * 0.055, 1, DENTE_RATO));
      gota(ctx, R, 17, 0.2, 0.014, fase(a, 0.7, 0.3), t, 0);
    },
  },
  {
    id: 'cadaver', nome: 'CADÁVER', emoji: '💀', cor: '#e8e0cc', brilho: [1.0, 0.15, 0.1],
    frase: 'A CARNE JÁ ERA', som: 'lamento',
    filtro: (a) => `saturate(${1 - 0.65 * a}) contrast(${1 + 0.25 * a}) brightness(${1 - 0.15 * a})`,
    pintar: pintarCadaver,
    depois(ctx, R, a, t) {
      const k = fase(a, 0.3, 0.4);
      olhoLeitoso(ctx, R, R.olhos[0], k);
      olhoVazio(ctx, R, R.olhos[1], k, 'rgba(255,40,20,A)');
      [[61, 0.45, 0.24], [17, 0.6, 0.3]].forEach(([p, ini, comp], i) => gota(ctx, R, p, comp, 0.016, fase(a, ini, 1 - ini), t, i));
    },
  },
];

// pré-calcula o deslocamento de cada ponto (só depende da posição dele no mapa UV)
MONSTROS.forEach((m) => {
  const f = DEFORMACOES[m.id];
  if (!f) return;
  m.deslocamentos = new Float32Array(UV.length * 2);
  UV.forEach(([u, v], i) => {
    const [du, dv] = f(u, v);
    m.deslocamentos[i * 2] = du;
    m.deslocamentos[i * 2 + 1] = dv;
  });
});

export function criarTexturas() {
  return MONSTROS.map((m) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    m.pintar(g);
    return c;
  });
}
