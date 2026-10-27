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

// --------------------------- texturas ---------------------------
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

function pintarVampiro(g) {
  baseRosto(g, '#e8ebf2');
  manchas(g, 28, [170, 180, 215], 0.35, 21, 1.4, 12);
  manchas(g, 90, [200, 200, 215], 0.25, 22, 2, 1.5);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.56, S * 0.56, 'rgba(70,60,90,0)', 'rgba(70,60,90,0.55)');
  // contorno marcado das maçãs do rosto
  [[50, 172, 0.55], [280, 397, -0.55]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.4); elipse(g, p[0], p[1], S * 0.11, S * 0.035, 'rgba(70,45,80,0.6)', null, ang); });
  [[127, 54], [356, 284]].forEach(([a, b]) => { const p = mix(U(a), U(b), 0.5); elipse(g, p[0], p[1], S * 0.06, S * 0.1, 'rgba(80,60,100,0.45)'); });
  // laterais do nariz
  [[193, 209], [417, 429]].forEach(([a, b]) => { const p = mix(U(a), U(b), 0.5); elipse(g, p[0], p[1], S * 0.015, S * 0.06, 'rgba(90,70,100,0.4)'); });
  // olhos esfumados vermelho-escuros
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(110,10,45,0.85)', 1.55, 0); olheira(g, o, 'rgba(25,0,15,0.85)', 0.95, 0.05); });
  sobrancelha(g, SOBR_A, SOBR_A_INF, 'rgba(15,8,15,0.95)', 5);
  sobrancelha(g, SOBR_B, SOBR_B_INF, 'rgba(15,8,15,0.95)', 5);
  veiasUV(g, 23, [[54, 1.4, 0.1], [284, 1.7, 0.1], [127, 0.5, 0.08], [356, 2.6, 0.08]], 'rgba(70,90,170,0.45)', 2.5);
  labios(g, '#5e0616');
  const brilhoLabio = mix(U(17), U(14), 0.5);
  elipse(g, brilhoLabio[0], brilhoLabio[1], S * 0.035, S * 0.01, 'rgba(255,200,210,0.45)');
}

function pintarLobisomem(g) {
  baseRosto(g, '#4e3726');
  const r = mulberry32(31);
  const nariz = U(1);
  const cores = ['#2a1c12', '#3f2b1d', '#5f4430', '#7d5d40', '#9c7d5a', '#1d130c'];
  g.save();
  g.lineCap = 'round';
  const dentro = new Path2D();
  FACE_OVAL.forEach((i, k) => { const [x, y] = U(i); k ? dentro.lineTo(x, y) : dentro.moveTo(x, y); });
  for (let i = 0; i < 11000; i++) {
    const x = r() * S, y = r() * S;
    if (!g.isPointInPath(dentro, x, y)) continue;
    let ang = Math.atan2(y - nariz[1] + S * 0.05, x - nariz[0]) * 0.75 + Math.PI / 2 * 0.25;
    ang += (r() - 0.5) * 0.5;
    const comp = 10 + r() * 22;
    const dMuz = dist([x, y], mix(U(1), U(0), 0.5)) / S;
    g.strokeStyle = dMuz < 0.12 && r() < 0.7 ? cores[3 + Math.floor(r() * 2)] : cores[Math.floor(r() * cores.length)];
    g.globalAlpha = 0.55 + r() * 0.45;
    g.lineWidth = 1.2 + r() * 1.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(ang) * comp * 0.5 + (r() - 0.5) * 4, y + Math.sin(ang) * comp * 0.5, x + Math.cos(ang) * comp, y + Math.sin(ang) * comp);
    g.stroke();
  }
  g.restore();
  // focinho mais claro
  const fc = mix(U(1), U(0), 0.6);
  elipse(g, fc[0], fc[1], S * 0.14, S * 0.11, 'rgba(165,135,100,0.55)');
  // olhos fundos
  [OLHO_A, OLHO_B].forEach((o) => olheira(g, o, 'rgba(15,8,4,0.9)', 1.3, 0));
  // sobrancelha única e grossa
  sobrancelha(g, SOBR_A, SOBR_A_INF, 'rgba(20,12,6,0.95)', 10);
  sobrancelha(g, SOBR_B, SOBR_B_INF, 'rgba(20,12,6,0.95)', 10);
  elipse(g, ...U(9), S * 0.05, S * 0.02, 'rgba(20,12,6,0.9)');
  // nariz de lobo, preto e úmido
  const nw = dist(U(98), U(327));
  const nc = mix(U(4), U(2), 0.4);
  elipse(g, nc[0], nc[1], nw * 0.85, nw * 0.6, 'rgba(10,6,4,1)', 'rgba(10,6,4,0)');
  elipse(g, nc[0], nc[1], nw * 0.65, nw * 0.45, 'rgba(8,5,3,1)', 'rgba(8,5,3,0.9)');
  elipse(g, nc[0] - nw * 0.15, nc[1] - nw * 0.2, nw * 0.15, nw * 0.07, 'rgba(255,255,255,0.45)');
  g.save();
  g.strokeStyle = 'rgba(10,6,4,0.9)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(...U(2)); g.lineTo(...U(0)); g.stroke();
  g.restore();
  labios(g, 'rgba(25,15,12,0.95)');
}

function pintarFantasma(g) {
  baseRosto(g, 'rgba(225,238,255,0.9)');
  manchas(g, 24, [170, 200, 240], 0.5, 41, 1.4, 14);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.55, S * 0.55, 'rgba(60,90,140,0)', 'rgba(60,90,140,0.6)');
  [OLHO_A, OLHO_B].forEach((o) => { olheira(g, o, 'rgba(0,10,35,0.9)', 1.7, 0.05); olheira(g, o, 'rgba(0,0,10,1)', 1.05, 0.05); });
  [[50, 172, 0.5], [280, 397, -0.5]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.45); elipse(g, p[0], p[1], S * 0.1, S * 0.05, 'rgba(40,60,110,0.55)', null, ang); });
  labios(g, 'rgba(30,45,80,0.9)');
}

function pintarCaveira(g) {
  baseRosto(g, '#ebe5d4');
  manchas(g, 36, [175, 160, 130], 0.4, 51, 1.6, 8);
  manchas(g, 120, [120, 110, 90], 0.25, 52, 2.5, 1);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.56, S * 0.56, 'rgba(60,50,40,0)', 'rgba(60,50,40,0.55)');
  const r = mulberry32(53);
  // órbitas
  [OLHO_A, OLHO_B].forEach((o) => {
    const oc = centroUV(o), w = larguraOlhoUV(o);
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
    // enfeites de caveira mexicana
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      g.fillStyle = k % 2 ? 'rgba(80,200,255,0.85)' : 'rgba(255,70,160,0.85)';
      g.beginPath();
      g.arc(cx + Math.cos(ang) * rx * 1.28, cy + Math.sin(ang) * ry * 1.28, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
  // nariz em forma de coração invertido
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
  // maçãs do rosto fundas
  [[50, 172, 0.55], [280, 397, -0.55]].forEach(([a, b, ang]) => { const p = mix(U(a), U(b), 0.45); elipse(g, p[0], p[1], S * 0.12, S * 0.045, 'rgba(40,30,25,0.6)', null, ang); });
  // boca costurada / dentes
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
  // rachaduras na testa
  g.save();
  g.strokeStyle = 'rgba(30,22,16,0.85)'; g.lineWidth = 2.5; g.lineJoin = 'round';
  let [x, y] = mix(U(10), U(338), 0.5);
  g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < 7; k++) { x += (r() - 0.3) * 30; y += 18 + r() * 14; g.lineTo(x, y); }
  g.stroke();
  g.restore();
}

function pintarPalhaco(g) {
  baseRosto(g, '#f5f2ea');
  manchas(g, 40, [210, 200, 190], 0.3, 61, 1.6, 6);
  const c = centroUV(FACE_OVAL);
  elipse(g, c[0], c[1], S * 0.57, S * 0.57, 'rgba(120,100,100,0)', 'rgba(120,100,100,0.35)');
  // losangos vermelhos atravessando os olhos
  [OLHO_A, OLHO_B].forEach((o) => {
    const [cx, cy] = centroUV(o);
    const w = larguraOlhoUV(o);
    g.save();
    g.fillStyle = '#c4102a';
    g.strokeStyle = 'rgba(20,0,0,0.7)';
    g.lineWidth = 3;
    g.filter = 'blur(1px)';
    g.beginPath();
    g.moveTo(cx, cy - w * 1.45);
    g.lineTo(cx + w * 0.32, cy);
    g.lineTo(cx, cy + w * 1.15);
    g.lineTo(cx - w * 0.32, cy);
    g.closePath();
    g.fill(); g.stroke();
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
  // bochechas
  elipse(g, ...U(50), S * 0.07, S * 0.05, 'rgba(230,60,80,0.45)');
  elipse(g, ...U(280), S * 0.07, S * 0.05, 'rgba(230,60,80,0.45)');
  // sorriso enorme
  labios(g, '#c4102a');
  [[61, 50], [291, 280]].forEach(([canto, bochecha]) => {
    const p = U(canto), q = mix(U(canto), U(bochecha), 0.75);
    g.save();
    g.strokeStyle = '#c4102a'; g.lineCap = 'round'; g.lineWidth = 22;
    g.beginPath(); g.moveTo(...p); g.quadraticCurveTo(p[0] + (q[0] - p[0]) * 0.2, q[1] + 30, ...q); g.stroke();
    g.restore();
  });
  // nariz vermelho
  const nw = dist(U(98), U(327));
  elipse(g, ...U(4), nw * 0.75, nw * 0.7, 'rgba(210,20,35,1)', 'rgba(190,10,25,0.95)');
  elipse(g, U(4)[0] - nw * 0.2, U(4)[1] - nw * 0.25, nw * 0.18, nw * 0.12, 'rgba(255,255,255,0.7)');
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

// ------------------------- presas e sangue -------------------------
function presa(ctx, R, base, comp, larg, sentido = 1) {
  const [x, y] = base;
  const d = [R.dir[0] * sentido, R.dir[1] * sentido];
  const n = [-d[1], d[0]];
  const ponta = [x + d[0] * comp, y + d[1] * comp];
  ctx.save();
  const g = ctx.createLinearGradient(x, y, ponta[0], ponta[1]);
  g.addColorStop(0, '#d9d2bd');
  g.addColorStop(0.6, '#fbf8ee');
  g.addColorStop(1, '#ffffff');
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

// ------------------------- pelos, orelhas, cabelo -------------------------
const rndPelo = mulberry32(77);
const PELOS = Array.from({ length: 520 }, () => ({ s: rndPelo(), c: rndPelo(), ang: rndPelo() - 0.5, cor: Math.floor(rndPelo() * 5), curva: rndPelo() - 0.5 }));
const CORES_PELO = ['#2a1c12', '#3f2b1d', '#5f4430', '#7d5d40', '#1a110a'];

function contornoTela(R) {
  const pts = FACE_OVAL.map(R.P);
  return (s) => {
    const f = s * pts.length;
    const i = Math.floor(f) % pts.length;
    return mix(pts[i], pts[(i + 1) % pts.length], f - Math.floor(f));
  };
}

function pelagem(ctx, R, a) {
  if (a <= 0.15) return;
  const k = fase(a, 0.15, 0.55);
  const ponto = contornoTela(R);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = k;
  PELOS.forEach((p) => {
    const [x, y] = ponto(p.s);
    let n = [x - R.C[0], y - R.C[1]];
    const nl = Math.hypot(...n);
    n = [n[0] / nl, n[1] / nl];
    const ang = Math.atan2(n[1], n[0]) + p.ang * 0.7;
    const comp = R.fh * (0.07 + p.c * 0.13) * (0.4 + 0.6 * k);
    const ini = [x - n[0] * R.fh * 0.03, y - n[1] * R.fh * 0.03];
    const fim = [ini[0] + Math.cos(ang) * comp, ini[1] + Math.sin(ang) * comp];
    ctx.strokeStyle = CORES_PELO[p.cor];
    ctx.lineWidth = Math.max(1.5, R.fw * (0.008 + p.c * 0.008));
    ctx.beginPath();
    ctx.moveTo(...ini);
    ctx.quadraticCurveTo(ini[0] + Math.cos(ang + p.curva) * comp * 0.6, ini[1] + Math.sin(ang + p.curva) * comp * 0.6, ...fim);
    ctx.stroke();
  });
  ctx.restore();
}

// pelos curtos atravessando a borda do rosto (desenhados por cima, escondem a "borda de máscara")
const PELOS_BORDA = Array.from({ length: 300 }, () => ({ s: rndPelo(), c: rndPelo(), ang: rndPelo() - 0.5, cor: Math.floor(rndPelo() * 5) }));

function pelagemBorda(ctx, R, a) {
  if (a <= 0.3) return;
  const k = fase(a, 0.3, 0.4);
  const ponto = contornoTela(R);
  ctx.save();
  ctx.lineCap = 'round';
  PELOS_BORDA.forEach((p) => {
    const [x, y] = ponto(p.s);
    let n = [x - R.C[0], y - R.C[1]];
    const nl = Math.hypot(...n);
    n = [n[0] / nl, n[1] / nl];
    const ang = Math.atan2(n[1], n[0]) + p.ang * 0.8;
    const comp = R.fh * (0.05 + p.c * 0.05) * k;
    const ini = [x - n[0] * R.fh * 0.045, y - n[1] * R.fh * 0.045];
    ctx.strokeStyle = CORES_PELO[p.cor];
    ctx.globalAlpha = 0.85 * k;
    ctx.lineWidth = Math.max(1.2, R.fw * 0.006);
    ctx.beginPath();
    ctx.moveTo(...ini);
    ctx.lineTo(ini[0] + Math.cos(ang) * comp, ini[1] + Math.sin(ang) * comp);
    ctx.stroke();
  });
  ctx.restore();
}

function orelhas(ctx, R, a) {
  if (a <= 0.2) return;
  const k = fase(a, 0.2, 0.5);
  [-1, 1].forEach((lado) => {
    const base1 = R.local(lado * 0.2, -0.48), base2 = R.local(lado * 0.48, -0.32);
    const ponta = R.local(lado * (0.42 + 0.1 * k), -0.48 - 0.42 * k);
    ctx.save();
    const g = ctx.createLinearGradient(...mix(base1, base2, 0.5), ...ponta);
    g.addColorStop(0, '#3a281a'); g.addColorStop(1, '#1a110a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(...base1); ctx.quadraticCurveTo(...mix(base1, ponta, 0.5), ...ponta); ctx.lineTo(...base2); ctx.closePath(); ctx.fill();
    const i1 = mix(base1, base2, 0.2), i2 = mix(base1, base2, 0.8), ip = mix(ponta, mix(base1, base2, 0.5), 0.3);
    ctx.fillStyle = 'rgba(70,35,30,0.9)';
    ctx.beginPath(); ctx.moveTo(...i1); ctx.lineTo(...ip); ctx.lineTo(...i2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5f4430'; ctx.lineWidth = Math.max(1, R.fw * 0.006); ctx.lineCap = 'round';
    for (let j = 0; j < 14; j++) {
      const s = j / 14;
      const p = mix(base1, ponta, s), q = mix(base2, ponta, s);
      [p, q].forEach((pt) => { ctx.beginPath(); ctx.moveTo(...pt); ctx.lineTo(pt[0] + (ponta[0] - pt[0]) * 0.1 + lado * R.fw * 0.02, pt[1] - R.fh * 0.015); ctx.stroke(); });
    }
    ctx.restore();
  });
}

// cabelo crespo do palhaço: muitos cachinhos (espirais) formando dois tufos ao lado da cabeça
const rndCab = mulberry32(91);
const CACHOS = Array.from({ length: 260 }, () => {
  const ang = rndCab() * Math.PI * 2, raio = Math.sqrt(rndCab());
  return { u: 0.66 + Math.cos(ang) * raio * 0.17, v: -0.2 + Math.sin(ang) * raio * 0.26, r: 0.018 + rndCab() * 0.022, tom: rndCab(), giro: rndCab() * 6 };
}).sort((p, q) => p.r - q.r);
const TONS_CABELO = ['#ff5a1f', '#ff3d12', '#e8320c', '#ff7a2e', '#c4260a'];

function cabeloPalhaco(ctx, R, a) {
  if (a <= 0.15) return;
  const k = fase(a, 0.15, 0.5);
  ctx.save();
  ctx.lineCap = 'round';
  [-1, 1].forEach((lado) => {
    // sombra/volume do tufo
    const centro = R.local(lado * (0.5 + 0.16 * k), -0.2);
    const gs = ctx.createRadialGradient(...centro, 0, ...centro, R.fw * 0.24 * k);
    gs.addColorStop(0, 'rgba(120,20,5,0.95)');
    gs.addColorStop(1, 'rgba(120,20,5,0)');
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

// ============================ os monstros ============================
const GOTAS_ZUMBI = [
  { ponto: 61, inicio: 0.3, comp: 0.26, larg: 0.018 },
  { ponto: 291, inicio: 0.45, comp: 0.18, larg: 0.014 },
  { ponto: 17, inicio: 0.6, comp: 0.34, larg: 0.022 },
  { ponto: 145, inicio: 0.78, comp: 0.22, larg: 0.009 },
];

export const MONSTROS = [
  {
    id: 'zumbi', nome: 'ZUMBI', emoji: '🧟', cor: '#8dff5a', brilho: [0.35, 1.0, 0.2],
    frase: 'VOCÊ FOI INFECTADO', som: 'rosnado',
    filtro: (a) => `saturate(${1 - 0.55 * a}) contrast(${1 + 0.15 * a}) brightness(${1 - 0.12 * a})`,
    pintar: pintarZumbi,
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoLeitoso(ctx, R, o, fase(a, 0.3, 0.4)));
      GOTAS_ZUMBI.forEach((g, i) => gota(ctx, R, g.ponto, g.comp, g.larg, fase(a, g.inicio, 1 - g.inicio), t, i));
    },
  },
  {
    id: 'vampiro', nome: 'VAMPIRO', emoji: '🧛', cor: '#ff2340', brilho: [1.0, 0.05, 0.15],
    frase: 'VOCÊ FOI MORDIDO', som: 'sibilo',
    filtro: (a) => `saturate(${1 - 0.6 * a}) contrast(${1 + 0.2 * a}) brightness(${1 - 0.1 * a}) sepia(${0.15 * a}) hue-rotate(${-15 * a}deg)`,
    pintar: pintarVampiro,
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.45, 0.4), 'rgba(255,20,40,A)', 'ponto', t));
      const k = fase(a, 0.55, 0.35);
      if (k > 0) [81, 311].forEach((i) => presa(ctx, R, R.P(i), R.fh * 0.075 * k, R.fw * 0.035));
      gota(ctx, R, 291, 0.2, 0.012, fase(a, 0.7, 0.3), t, 1);
    },
  },
  {
    id: 'lobisomem', nome: 'LOBISOMEM', emoji: '🐺', cor: '#ffb02e', brilho: [1.0, 0.6, 0.1],
    frase: 'A LUA CHEIA TE PEGOU', som: 'uivo',
    filtro: (a) => `saturate(${1 - 0.2 * a}) contrast(${1 + 0.2 * a}) brightness(${1 - 0.15 * a}) sepia(${0.25 * a})`,
    pintar: pintarLobisomem,
    antes(ctx, R, a) { orelhas(ctx, R, a); pelagem(ctx, R, a); },
    depois(ctx, R, a, t) {
      pelagemBorda(ctx, R, a);
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.35, 0.4), 'rgba(255,180,20,A)', 'fenda', t));
      const k = fase(a, 0.5, 0.35);
      if (k > 0) {
        [81, 311].forEach((i) => presa(ctx, R, R.P(i), R.fh * 0.09 * k, R.fw * 0.04));
        if (R.boca > 0.03) [178, 402].forEach((i) => presa(ctx, R, R.P(i), R.fh * 0.06 * k, R.fw * 0.035, -1));
      }
    },
  },
  {
    id: 'fantasma', nome: 'FANTASMA', emoji: '👻', cor: '#8fe9ff', brilho: [0.5, 0.9, 1.0],
    frase: 'VOCÊ ESTÁ MORTO', som: 'lamento', fantasma: true,
    filtro: (a) => `saturate(${1 - 0.85 * a}) brightness(${1 + 0.15 * a}) contrast(${1 + 0.1 * a})`,
    pintar: pintarFantasma,
    depois(ctx, R, a) {
      const k = fase(a, 0.3, 0.4);
      R.olhos.forEach((o) => olhoVazio(ctx, R, o, k, 'rgba(160,240,255,A)'));
      if (k > 0) {
        ctx.save();
        ctx.filter = `blur(${Math.max(1, R.fw * 0.01)}px)`;
        caminhoTela(ctx, R, BOCA, 1.15, 1.6);
        ctx.fillStyle = `rgba(0,0,8,${0.95 * k})`;
        ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'caveira', nome: 'CAVEIRA', emoji: '💀', cor: '#f2f2f2', brilho: [1.0, 0.4, 0.8],
    frase: 'SÓ O OSSO', som: 'chocalho',
    filtro: (a) => `saturate(${1 - 0.7 * a}) contrast(${1 + 0.25 * a}) brightness(${1 - 0.15 * a})`,
    pintar: pintarCaveira,
    depois(ctx, R, a) {
      R.olhos.forEach((o) => olhoVazio(ctx, R, o, fase(a, 0.35, 0.4), 'rgba(255,255,255,A)'));
    },
  },
  {
    id: 'palhaco', nome: 'PALHAÇO', emoji: '🤡', cor: '#ff4fd8', brilho: [1.0, 0.2, 0.3],
    frase: 'HORA DO SHOW', som: 'risada',
    filtro: (a) => `saturate(${1 + 0.1 * a}) contrast(${1 + 0.2 * a}) brightness(${1 - 0.1 * a})`,
    pintar: pintarPalhaco,
    antes(ctx, R, a) { cabeloPalhaco(ctx, R, a); },
    depois(ctx, R, a, t) {
      R.olhos.forEach((o) => olhoBrilhante(ctx, R, o, fase(a, 0.6, 0.4) * 0.8, 'rgba(255,210,0,A)', 'ponto', t));
    },
  },
];

export function criarTexturas() {
  return MONSTROS.map((m) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    m.pintar(g);
    return c;
  });
}
