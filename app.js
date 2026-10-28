import { FaceLandmarker, FilesetResolver, GestureRecognizer, ImageSegmenter } from './vendor/vision_bundle.mjs';
import { criarRenderizador } from './render.js';
import { MONSTROS, criarTexturas, geometria, mulberry32, deformarRosto } from './monstros.js';
import { desenharQR } from './qr.js';

// ============================ CONFIGURAÇÃO ============================
const CONFIG = {
  titulo: 'NOITE DOS MONSTROS',        // topo da foto
  rodape: 'TV1 · HALLOWEEN 2026',      // rodapé da foto
  dataFicticia: '31 OUT 1996',         // data "da fita" exibida na tela
  segundosTransformacao: 6,            // tempo até a transformação completa
  segundosRoleta: 2.8,                 // duração do sorteio do monstro
  segundosPreviewFoto: 45,             // quanto tempo a foto (com o QR code) fica na tela
  maxRostos: 4,
  trocarCenarioPorPessoa: true,        // sorteia um cenário novo a cada pessoa que chega
  logo: 'marca/logo-tv1.png',          // logo exibido na tela e nas fotos
  intensidadeDeformacao: 1,            // quanto o formato do rosto muda (0 = nada, 1 = normal, 1.5 = exagerado)
  fotoPorGesto: true,                  // 👍 ou ✌️ na frente da câmera também tira a foto
  segundosGesto: 0.8,                  // quanto tempo segurar o gesto para disparar
};

const MODOS = ['VHS', 'PS1', 'CCTV'];
const FONTE_TERROR = 'Creepster, Impact, sans-serif';
const FONTE_VHS = 'VT323, "Lucida Console", monospace';
const FONTE_EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

// ============================== ELEMENTOS ==============================
const $ = (id) => document.getElementById(id);
const video = $('video');
const tela = $('tela');
const inicioEl = $('inicio');
const btnComecar = $('comecar');
const statusEl = $('status');
const ajudaEl = $('ajuda');
const flashEl = $('flash');
const fotoEl = $('foto');
const fotoImg = $('fotoImg');
const fotoMsg = $('fotoMsg');
const desempenhoEl = $('desempenho');
const controlesEl = $('controles');
const btnMonstro = $('btnMonstro');
const btnFoto = $('btnFoto');
const btnFundo = $('btnFundo');
const nomeMonstroEl = $('nomeMonstro');
const nomeFundoEl = $('nomeFundo');
const qrPainel = $('qrPainel');
const qrCanvas = $('qr');
const btnFecharFoto = $('fecharFoto');
const fotoTempoEl = $('fotoTempo');
const dicaGestoEl = $('dicaGesto');

let W = 1280, H = 720;
const novoCanvas = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; };
const [comp, cx] = novoCanvas();                  // cena: fundo + pessoa + pelos/cabelo
const [sobre, sx] = novoCanvas();                 // efeitos por cima do rosto + textos
const [pessoa, pc] = novoCanvas();                // pessoa recortada do fundo
const [mascaraPessoa, mpc] = novoCanvas();        // silhueta vinda do segmentador
const [rastro, rc] = novoCanvas();                // rastro do fantasma

// =============================== ESTADO ===============================
let landmarker = null;
let segmentador = null;
let reconhecedorGestos = null;
let render = null;
let texturas = [];
let logoImg = null;
let cenarios = [];          // { img, nome, tinta }
let cenarioAtual = -1;      // -1 = fundo real da câmera
let mascaraPronta = false;
let mascaraDados = null;
let suavizados = [];
let geos = [];
let ultimoTempoVideo = -1;
let quadrosVideo = 0;
let infeccao = 0;
let semRostoHa = 99;
let tinhaRosto = false;
let transformadoEm = -99;
let glitch = 0;
let t = 0;
let ultimoFrame = performance.now();
let modo = 0;
let monstroAtual = 0;
let modoMonstro = 'roleta';  // 'roleta' sorteia a cada pessoa; 'fixo' usa o escolhido nas teclas 1-6
const roleta = { ativa: false, t0: 0, de: 0, passos: 0, exibido: 0 };
const foto = { fase: 'ocioso', t0: 0, ultimoNumero: -1 };
// precisaSoltar: depois de uma foto por gesto, a mão tem que sair antes de valer de novo
const gesto = { nome: null, desde: 0, precisaSoltar: false };
const GESTOS_FOTO = { Thumb_Up: '👍', Victory: '✌️' };

try { modo = Math.min(2, Math.max(0, parseInt(localStorage.getItem('zumbi-modo') || '0', 10) || 0)); } catch {}

const rnd = mulberry32(1996);
const entre = (a, b) => a + (b - a) * rnd();

// ================================ SONS ================================
const som = {
  ctx: null,
  ligado: true,
  iniciar() { try { this.ctx = new AudioContext(); } catch { this.ctx = null; } },
  ok() { return this.ctx && this.ligado; },
  agora() { return this.ctx.currentTime; },
  ruido(dur) {
    const b = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    return s;
  },
  envelope(volume, ataque, dur, inicio = 0) {
    const g = this.ctx.createGain();
    const n = this.agora() + inicio;
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(volume, n + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    g.connect(this.ctx.destination);
    return g;
  },
  filtro(tipo, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = tipo; f.frequency.value = freq; f.Q.value = q;
    return f;
  },
  osc(tipo, freq) { const o = this.ctx.createOscillator(); o.type = tipo; o.frequency.value = freq; return o; },
  estatica(dur = 0.45) {
    if (!this.ok()) return;
    const s = this.ruido(dur);
    s.connect(this.filtro('bandpass', 2200, 0.6)).connect(this.envelope(0.22, 0.01, dur));
    s.start();
  },
  bip(freq = 880, dur = 0.12, vol = 0.12) {
    if (!this.ok()) return;
    const o = this.osc('square', freq);
    o.connect(this.envelope(vol, 0.005, dur));
    o.start(); o.stop(this.agora() + dur);
  },
  obturador() {
    if (!this.ok()) return;
    const s = this.ruido(0.12);
    s.connect(this.filtro('highpass', 3000)).connect(this.envelope(0.4, 0.002, 0.12));
    s.start();
  },
  impacto() {
    if (!this.ok()) return;
    const o = this.osc('sine', 90);
    o.frequency.exponentialRampToValueAtTime(35, this.agora() + 0.9);
    o.connect(this.envelope(0.6, 0.01, 1.1));
    o.start(); o.stop(this.agora() + 1.1);
    const r = this.ruido(0.5);
    r.connect(this.filtro('lowpass', 600)).connect(this.envelope(0.3, 0.005, 0.5));
    r.start();
  },
  rosnado(freq = 85, dur = 1.8) {
    const n = this.agora();
    const o = this.osc('sawtooth', freq);
    o.frequency.linearRampToValueAtTime(freq * 0.65, n + dur);
    const lfo = this.osc('sine', 9), lfoG = this.ctx.createGain();
    lfoG.gain.value = 22;
    lfo.connect(lfoG).connect(o.frequency);
    const dist = this.ctx.createWaveShaper();
    const curva = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curva[i] = Math.tanh((i / 512 - 1) * 6);
    dist.curve = curva;
    const saida = this.envelope(0.35, 0.12, dur);
    o.connect(dist).connect(this.filtro('lowpass', 700)).connect(saida);
    const r = this.ruido(dur);
    r.connect(this.filtro('lowpass', 450)).connect(saida);
    o.start(); lfo.start(); r.start();
    o.stop(n + dur); lfo.stop(n + dur);
  },
  sibilo() {
    const r = this.ruido(1.4);
    r.connect(this.filtro('highpass', 3500)).connect(this.envelope(0.3, 0.15, 1.4));
    r.start();
    const o = this.osc('sine', 1800);
    o.frequency.exponentialRampToValueAtTime(900, this.agora() + 1.2);
    o.connect(this.envelope(0.04, 0.2, 1.2));
    o.start(); o.stop(this.agora() + 1.2);
  },
  // rosnado grave de demônio + sussurro
  demonio() {
    this.rosnado(42, 2.6);
    this.sibilo();
  },
  // guincho agudo e estridente
  grito() {
    const n = this.agora(), dur = 1.6;
    [900, 1210].forEach((f) => {
      const o = this.osc('sawtooth', f);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, n + 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, n + dur);
      const lfo = this.osc('sine', 13), lfoG = this.ctx.createGain();
      lfoG.gain.value = f * 0.04;
      lfo.connect(lfoG).connect(o.frequency);
      o.connect(this.filtro('bandpass', 2200, 1.5)).connect(this.envelope(0.18, 0.05, dur));
      o.start(); lfo.start(); o.stop(n + dur); lfo.stop(n + dur);
    });
    const r = this.ruido(dur);
    r.connect(this.filtro('bandpass', 3000, 0.8)).connect(this.envelope(0.12, 0.05, dur));
    r.start();
  },
  lamento() {
    const n = this.agora(), dur = 2.8;
    [440, 466].forEach((f) => {
      const o = this.osc('sine', f);
      o.frequency.linearRampToValueAtTime(f * 0.7, n + dur);
      const lfo = this.osc('sine', 4), lfoG = this.ctx.createGain();
      lfoG.gain.value = 8;
      lfo.connect(lfoG).connect(o.frequency);
      const atraso = this.ctx.createDelay(1);
      atraso.delayTime.value = 0.28;
      const retorno = this.ctx.createGain();
      retorno.gain.value = 0.45;
      const saida = this.envelope(0.12, 0.6, dur);
      o.connect(saida);
      o.connect(atraso).connect(retorno).connect(atraso);
      retorno.connect(saida);
      o.start(); lfo.start(); o.stop(n + dur); lfo.stop(n + dur);
    });
  },
  morcegos() {
    for (let i = 0; i < 10; i++) {
      const ini = i * 0.1 + Math.random() * 0.05, f = 2600 + Math.random() * 1800;
      const o = this.osc('sine', f);
      o.frequency.setValueAtTime(f, this.agora() + ini);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, this.agora() + ini + 0.05);
      o.connect(this.envelope(0.12, 0.005, 0.06, ini));
      o.start(this.agora() + ini); o.stop(this.agora() + ini + 0.07);
    }
  },
  risada() {
    for (let i = 0; i < 6; i++) {
      const ini = i * 0.17;
      const o = this.osc('sawtooth', 340 - i * 22);
      o.frequency.setValueAtTime(340 - i * 22, this.agora() + ini);
      o.frequency.linearRampToValueAtTime(280 - i * 22, this.agora() + ini + 0.12);
      o.connect(this.filtro('bandpass', 1000, 3)).connect(this.envelope(0.3, 0.01, ini + 0.13, ini));
      o.start(this.agora() + ini); o.stop(this.agora() + ini + 0.14);
    }
  },
  monstro(nome) { if (this.ok() && this[nome]) this[nome](); },
};

// ============================== LOGO ==============================
async function carregarLogo() {
  const img = new Image();
  img.src = CONFIG.logo;
  try { await img.decode(); logoImg = img; } catch { logoImg = null; }
}

// desenha o logo (ou um selo provisório "TV1" enquanto o arquivo não for colocado em marca/)
function desenharLogo(ctx, x, y, h, alinhar = 'right') {
  ctx.save();
  let w;
  if (logoImg) {
    w = (h * logoImg.width) / logoImg.height;
  } else {
    ctx.font = `900 ${h * 0.7}px "Arial Black", Arial, sans-serif`;
    w = ctx.measureText('TV1').width + h * 0.55;
  }
  const x0 = alinhar === 'right' ? x - w : alinhar === 'center' ? x - w / 2 : x;
  if (logoImg) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = h * 0.2;
    ctx.drawImage(logoImg, x0, y, w, h);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(x0, y, w, h, h * 0.18);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TV1', x0 + w / 2, y + h * 0.54);
  }
  ctx.restore();
  return w;
}

// ============================== CENÁRIOS ==============================
async function carregarCenarios() {
  let lista = [];
  try { lista = await (await fetch('api/cenarios')).json(); } catch { return; }
  const amostra = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const carregados = await Promise.all(lista.map(async (arquivo) => {
    const img = new Image();
    img.src = `cenarios/${encodeURIComponent(arquivo)}`;
    try { await img.decode(); } catch { return null; }
    // cor média do cenário, usada para "iluminar" a pessoa com a luz do ambiente
    amostra.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = amostra.getImageData(0, 0, 1, 1).data;
    const nome = arquivo.replace(/\.[^.]+$/, '').replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').toUpperCase();
    return { img, nome, tinta: [r, g, b], src: img.src };
  }));
  cenarios = carregados.filter(Boolean);
  if (cenarios.length) cenarioAtual = Math.floor(Math.random() * cenarios.length);
}

function trocarCenario(indice) {
  if (!cenarios.length) return;
  cenarioAtual = indice;
  glitch = Math.max(glitch, 0.8);
}

function sortearCenario() {
  if (cenarios.length < 2 || cenarioAtual < 0) return;
  let n;
  do { n = Math.floor(Math.random() * cenarios.length); } while (n === cenarioAtual);
  trocarCenario(n);
}

const usandoCenario = () => cenarioAtual >= 0 && cenarios[cenarioAtual] && segmentador && mascaraPronta;
const monstro = () => MONSTROS[roleta.ativa ? roleta.exibido : monstroAtual];
const progresso = () => (roleta.ativa ? 0 : infeccao);

function atualizarMascaraPessoa(agora) {
  segmentador.segmentForVideo(video, agora, (res) => {
    const m = res.confidenceMasks && res.confidenceMasks[0];
    if (!m) return;
    const conf = m.getAsFloat32Array();
    if (!mascaraDados || mascaraDados.width !== m.width || mascaraDados.height !== m.height) {
      mascaraPessoa.width = m.width;
      mascaraPessoa.height = m.height;
      mascaraDados = mpc.createImageData(m.width, m.height);
    }
    const px8 = mascaraDados.data;
    for (let i = 0, j = 3; i < conf.length; i++, j += 4) {
      px8[j] = Math.max(0, Math.min(255, (conf[i] - 0.25) * 510)); // borda mais definida
    }
    mpc.putImageData(mascaraDados, 0, 0);
    mascaraPronta = true;
  });
}

// ============================== DESENHO ==============================
function desenharEspelhado(ctx) {
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
}

function desenharCenario(a) {
  const { img } = cenarios[cenarioAtual];
  const zoom = 1.06 + 0.04 * Math.sin(t * 0.07);
  const escala = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * escala, h = img.height * escala;
  cx.filter = `brightness(${0.85 - 0.12 * a}) saturate(0.85)`;
  cx.drawImage(img, (W - w) / 2 + Math.sin(t * 0.05) * W * 0.01, (H - h) / 2, w, h);
  cx.filter = 'none';
}

function prepararPessoa(filtro) {
  const [r, g, b] = cenarios[cenarioAtual].tinta;
  pc.globalCompositeOperation = 'source-over';
  pc.clearRect(0, 0, W, H);
  pc.filter = filtro;
  desenharEspelhado(pc);
  pc.filter = 'none';
  pc.globalCompositeOperation = 'destination-in';
  pc.save();
  pc.translate(W, 0);
  pc.scale(-1, 1);
  pc.drawImage(mascaraPessoa, 0, 0, W, H);
  pc.restore();
  pc.globalCompositeOperation = 'source-atop';
  pc.fillStyle = `rgba(${r},${g},${b},0.28)`;
  pc.fillRect(0, 0, W, H);
  pc.globalCompositeOperation = 'source-over';
}

function desenharFantasma(a) {
  rc.globalCompositeOperation = 'destination-out';
  rc.fillStyle = 'rgba(0,0,0,0.14)';
  rc.fillRect(0, 0, W, H);
  rc.globalCompositeOperation = 'source-over';
  rc.globalAlpha = 0.4;
  rc.drawImage(pessoa, 0, 0);
  rc.globalAlpha = 1;
  cx.save();
  cx.globalCompositeOperation = 'screen';
  cx.globalAlpha = 0.55 * a;
  cx.drawImage(rastro, Math.sin(t * 2) * W * 0.004, 0);
  cx.restore();
  cx.save();
  cx.globalAlpha = 1 - 0.45 * a * (0.85 + 0.15 * Math.sin(t * 7));
  cx.shadowColor = 'rgba(140,230,255,0.9)';
  cx.shadowBlur = 30 * a;
  cx.drawImage(pessoa, 0, 0);
  cx.restore();
}

const NEVOA = Array.from({ length: 7 }, () => ({ x: rnd(), y: entre(0.65, 1), r: entre(0.25, 0.45), vel: entre(0.005, 0.02) }));

function desenharNevoa() {
  cx.save();
  cx.globalCompositeOperation = 'screen';
  NEVOA.forEach((n) => {
    const x = (((n.x + t * n.vel) % 1.4) - 0.2) * W;
    const y = n.y * H;
    const raio = n.r * W;
    const g = cx.createRadialGradient(x, y, 0, x, y, raio);
    g.addColorStop(0, 'rgba(150,165,175,0.16)');
    g.addColorStop(1, 'rgba(150,165,175,0)');
    cx.fillStyle = g;
    cx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
  });
  cx.restore();
}

function desenharCena() {
  const m = monstro();
  const a = progresso();
  const filtro = m.filtro(a);
  cx.globalCompositeOperation = 'source-over';
  cx.globalAlpha = 1;
  if (usandoCenario()) {
    desenharCenario(a);
    prepararPessoa(filtro);
    if (m.fantasma && a > 0) desenharFantasma(a);
    else cx.drawImage(pessoa, 0, 0);
  } else {
    cx.filter = filtro;
    desenharEspelhado(cx);
    cx.filter = 'none';
  }
  if (a > 0 && m.antes) geos.forEach((R) => m.antes(cx, R, a, t));
  if (usandoCenario()) desenharNevoa();
}

// ============================ TEXTOS NA TELA ============================
const esc = () => H / 720;

function texto(str, x, y, cor, alinhamento = 'left', tamanho = 44, fonte = FONTE_VHS) {
  const s = esc();
  sx.font = `${Math.round(tamanho * s)}px ${fonte}`;
  sx.textAlign = alinhamento;
  sx.fillStyle = 'rgba(0,0,0,0.7)';
  sx.fillText(str, x + 3 * s, y + 3 * s);
  sx.fillStyle = cor;
  sx.fillText(str, x, y);
}

function textoTerror(str, x, y, cor, tamanho) {
  const s = esc();
  sx.save();
  sx.font = `${Math.round(tamanho * s)}px ${FONTE_TERROR}`;
  sx.textAlign = 'center';
  sx.textBaseline = 'middle';
  let largura = sx.measureText(str).width;
  if (largura > W * 0.92) {
    sx.font = `${Math.round((tamanho * s * W * 0.92) / largura)}px ${FONTE_TERROR}`;
    largura = W * 0.92;
  }
  sx.shadowColor = cor;
  sx.shadowBlur = 30 * s;
  sx.fillStyle = 'rgba(0,0,0,0.85)';
  sx.fillText(str, x + 5 * s, y + 5 * s);
  sx.fillStyle = cor;
  sx.fillText(str, x, y);
  sx.shadowBlur = 0;
  sx.restore();
}

function emoji(str, x, y, tamanho) {
  sx.save();
  sx.font = `${Math.round(tamanho * esc())}px ${FONTE_EMOJI}`;
  sx.textAlign = 'center';
  sx.textBaseline = 'middle';
  sx.fillText(str, x, y);
  sx.restore();
}

function barra(rotulo, valor, x, y, cor) {
  const blocos = 10;
  const cheios = Math.round(valor * blocos);
  texto(`${rotulo} ${'█'.repeat(cheios)}${'░'.repeat(blocos - cheios)} ${String(Math.round(valor * 100)).padStart(3, ' ')}%`,
    x, y, cor, 'center', 38);
}

function relogio() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

function desenharOSD() {
  const s = esc();
  const m = 42 * s;
  const pisca = Math.floor(t * 1.6) % 2 === 0;
  const mon = monstro();
  sx.save();
  sx.textBaseline = 'top';
  const hud = foto.fase !== 'disparo';
  const temRosto = semRostoHa < 0.8;

  if (modo === 0) {
    if (pisca) texto('●', m, m, '#ff2b2b');
    texto('REC', m + 34 * s, m, '#ffffff');
    if (temRosto) desenharLogo(sx, W - m, m - 4 * s, 46 * s, 'right');
    texto(CONFIG.dataFicticia, m, H - m - 44 * s, '#ffffff');
    texto(relogio(), W - m, H - m - 44 * s, '#ffffff', 'right');
    if (hud && temRosto && !roleta.ativa) barra(mon.nome, infeccao, W / 2, m, mon.cor);
  } else if (modo === 1) {
    texto('PLAYER 1', m, m, '#ffd23b');
    if (hud && temRosto && !roleta.ativa) barra('VIDA', 1 - infeccao, W / 2, m, infeccao < 0.6 ? '#5cff5c' : '#ff3b3b');
    desenharLogo(sx, W - m, H - m - 46 * s, 46 * s, 'right');
  } else {
    const local = usandoCenario() ? cenarios[cenarioAtual].nome : 'CORREDOR B';
    texto(`CAM ${String(Math.max(0, cenarioAtual) + 1).padStart(2, '0')}  ${local}`, m, m, '#e8ffe8');
    if (pisca) texto('● REC', W - m, m, '#ffffff', 'right');
    texto(`${CONFIG.dataFicticia}  ${relogio()}`, m, H - m - 44 * s, '#e8ffe8');
    desenharLogo(sx, W - m, H - m - 46 * s, 46 * s, 'right');
    if (hud && temRosto && infeccao > 0.4 && pisca && !roleta.ativa) {
      texto(`!! ALERTA: ${mon.nome} DETECTADO !!`, W / 2, m + 56 * s, '#ffffff', 'center', 40);
    }
  }

  sx.textBaseline = 'middle';
  if (foto.fase === 'ocioso' && gesto.nome) {
    desenharGesto();
  } else if (foto.fase === 'contagem') {
    const n = 3 - Math.floor(t - foto.t0);
    const frac = (t - foto.t0) % 1;
    textoTerror(String(Math.max(1, n)), W / 2, H / 2, '#ffffff', 300 * (1.15 - frac * 0.25));
  } else if (foto.fase === 'ocioso' && roleta.ativa) {
    texto('SORTEANDO SUA MALDIÇÃO...', W / 2, H * 0.2, '#ffffff', 'center', 52);
    emoji(mon.emoji, W / 2, H * 0.5, 210);
    textoTerror(mon.nome, W / 2, H * 0.76, mon.cor, 110);
  } else if (foto.fase === 'ocioso' && t - transformadoEm < 3.2 && temRosto) {
    if (Math.floor(t * 4) % 2 === 0) textoTerror(mon.frase, W / 2, H * 0.8, mon.cor, 100);
  } else if (foto.fase === 'ocioso' && !temRosto) {
    desenharChamada();
  } else if (foto.fase === 'ocioso' && infeccao >= 1 && pisca) {
    texto(reconhecedorGestos ? 'FAÇA 👍 OU ✌️ PARA TIRAR A FOTO' : 'APERTE "TIRAR FOTO" LÁ EMBAIXO', W / 2, H * 0.74, '#ffffff', 'center', 48);
  }
  sx.restore();
}

// tela de espera, quando não há ninguém na frente da câmera
function desenharChamada() {
  const s = esc();
  sx.save();
  sx.fillStyle = 'rgba(0,0,0,0.35)';
  sx.fillRect(0, 0, W, H);
  sx.restore();
  desenharLogo(sx, W / 2, H * 0.1, 80 * s, 'center');
  textoTerror('NOITE DOS MONSTROS', W / 2, H * 0.36, '#ff2b2b', 120);
  const k = Math.floor(t * 1.5) % MONSTROS.length;
  MONSTROS.forEach((m, i) => {
    const x = W / 2 + (i - (MONSTROS.length - 1) / 2) * 120 * s;
    const destaque = i === k;
    sx.save();
    sx.globalAlpha = destaque ? 1 : 0.45;
    emoji(m.emoji, x, H * 0.58 - (destaque ? 12 * s : 0), destaque ? 92 : 70);
    sx.restore();
  });
  if (Math.floor(t * 1.6) % 2 === 0) texto('APROXIME-SE... SE TIVER CORAGEM', W / 2, H * 0.78, '#ffffff', 'center', 56);
}

function desenharSobre() {
  sx.clearRect(0, 0, W, H);
  const m = monstro();
  const a = progresso();
  if (a > 0 && m.depois) geos.forEach((R) => m.depois(sx, R, a, t));
  desenharOSD();
}

// ============================== LÓGICA ==============================
function suavizar(brutos) {
  if (brutos.length !== suavizados.length) {
    suavizados = brutos.map((f) => f.map((p) => ({ x: p.x, y: p.y, z: p.z })));
    return;
  }
  brutos.forEach((f, i) => {
    const sv = suavizados[i];
    // movimento grande = segue rápido; parado = suaviza mais (menos tremor)
    let mov = 0;
    for (let k = 0; k < f.length; k += 25) mov += Math.abs(f[k].x - sv[k].x) + Math.abs(f[k].y - sv[k].y);
    const alfa = Math.min(1, 0.35 + (mov / Math.ceil(f.length / 25)) * 60);
    for (let k = 0; k < f.length && k < sv.length; k++) {
      sv[k].x += (f[k].x - sv[k].x) * alfa;
      sv[k].y += (f[k].y - sv[k].y) * alfa;
      sv[k].z += (f[k].z - sv[k].z) * alfa;
    }
  });
}

function iniciarRoleta() {
  const N = MONSTROS.length;
  let resultado;
  do { resultado = Math.floor(Math.random() * N); } while (N > 1 && resultado === monstroAtual);
  roleta.ativa = true;
  roleta.t0 = performance.now() / 1000;
  roleta.de = monstroAtual;
  roleta.passos = N * 3 + ((resultado - monstroAtual + N) % N);
  roleta.exibido = monstroAtual;
  infeccao = 0;
}

function atualizarRoleta() {
  if (!roleta.ativa) return;
  const p = Math.min(1, (t - roleta.t0) / CONFIG.segundosRoleta);
  const pos = Math.floor(roleta.passos * (1 - (1 - p) ** 3));
  const idx = (roleta.de + pos) % MONSTROS.length;
  if (idx !== roleta.exibido) { roleta.exibido = idx; som.bip(1400, 0.03, 0.08); }
  if (p >= 1) {
    roleta.ativa = false;
    monstroAtual = (roleta.de + roleta.passos) % MONSTROS.length;
    glitch = 1;
    som.impacto();
  }
}

function atualizarInfeccao(dt) {
  if (suavizados.length) {
    semRostoHa = 0;
    if (!tinhaRosto) {
      som.estatica();
      glitch = Math.max(glitch, 0.7);
      if (foto.fase === 'ocioso') {
        if (CONFIG.trocarCenarioPorPessoa) sortearCenario();
        if (modoMonstro === 'roleta') iniciarRoleta();
      }
    }
    tinhaRosto = true;
    if (!roleta.ativa) {
      const vel = foto.fase === 'contagem' ? 4 : 1;
      const antes = infeccao;
      infeccao = Math.min(1, infeccao + (dt * vel) / CONFIG.segundosTransformacao);
      if (antes < 1 && infeccao >= 1) { transformadoEm = t; glitch = 1; som.monstro(MONSTROS[monstroAtual].som); }
    }
  } else {
    semRostoHa += dt;
    if (semRostoHa > 1.5) { infeccao = Math.max(0, infeccao - dt); tinhaRosto = false; }
  }
  glitch = Math.max(0, glitch - dt * 1.4);
  if (Math.random() < dt * 0.12) glitch = Math.max(glitch, 0.3);
}

function atualizarFoto() {
  if (foto.fase === 'contagem') {
    const n = 3 - Math.floor(t - foto.t0);
    if (n !== foto.ultimoNumero && n > 0) { foto.ultimoNumero = n; som.bip(n === 1 ? 1320 : 880); }
    if (t - foto.t0 >= 3) foto.fase = 'disparo';
  } else if (foto.fase === 'preview') {
    const resta = Math.ceil(CONFIG.segundosPreviewFoto - (t - foto.t0));
    if (resta <= 0) fecharPreview();
    else escrever(fotoTempoEl, `(${resta}s)`);
  }
}

function iniciarFoto() {
  if (foto.fase === 'ocioso' && !roleta.ativa) {
    foto.fase = 'contagem'; foto.t0 = performance.now() / 1000; foto.ultimoNumero = -1;
  } else if (foto.fase === 'preview' && t - foto.t0 > 1.5) {
    fecharPreview();
  }
}

// 👍 ou ✌️ segurado por alguns instantes inicia a contagem da foto
function atualizarGesto(agora) {
  if (foto.fase !== 'ocioso' || roleta.ativa || semRostoHa >= 0.8) { gesto.nome = null; return; }
  const res = reconhecedorGestos.recognizeForVideo(video, agora);
  const achado = (res.gestures || []).map((g) => g[0]).find((g) => g && GESTOS_FOTO[g.categoryName] && g.score > 0.6);
  if (!achado) { gesto.nome = null; gesto.precisaSoltar = false; return; }
  if (gesto.precisaSoltar) return;
  if (gesto.nome !== achado.categoryName) { gesto.nome = achado.categoryName; gesto.desde = t; }
  if (t - gesto.desde >= CONFIG.segundosGesto) {
    gesto.nome = null;
    gesto.precisaSoltar = true;
    iniciarFoto();
  }
}

function desenharGesto() {
  const s = esc();
  const k = Math.min(1, (t - gesto.desde) / CONFIG.segundosGesto);
  const x = W / 2, y = H * 0.5, r = 120 * s;
  sx.save();
  sx.fillStyle = 'rgba(0,0,0,0.55)';
  sx.beginPath(); sx.arc(x, y, r, 0, Math.PI * 2); sx.fill();
  sx.strokeStyle = '#ff2b2b';
  sx.lineWidth = 14 * s;
  sx.lineCap = 'round';
  sx.beginPath(); sx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); sx.stroke();
  sx.restore();
  emoji(GESTOS_FOTO[gesto.nome], x, y, 130);
  texto('SEGURA AÍ...', x, y + r + 50 * s, '#ffffff', 'center', 48);
}

function fecharPreview() {
  fotoEl.classList.add('oculto');
  foto.fase = 'ocioso';
}

// ======================= BOTÕES NA TELA =======================
function proximoMonstro() {
  roleta.ativa = false;
  monstroAtual = (monstroAtual + 1) % MONSTROS.length;
  glitch = 1;
  som.estatica(0.3);
  if (infeccao >= 1) { transformadoEm = t; som.monstro(MONSTROS[monstroAtual].som); }
}

// percorre os cenários e, no fim, o fundo real da câmera
function proximoFundo() {
  if (!cenarios.length) return;
  trocarCenario(cenarioAtual + 1 < cenarios.length ? cenarioAtual + 1 : -1);
  som.estatica(0.3);
}

const nomeFundo = () => (cenarioAtual >= 0 && cenarios[cenarioAtual] ? cenarios[cenarioAtual].nome : 'CÂMERA REAL');

function escrever(el, txt) { if (el.textContent !== txt) el.textContent = txt; }

function atualizarControles() {
  controlesEl.classList.toggle('oculto', foto.fase !== 'ocioso');
  const m = monstro();
  escrever(nomeMonstroEl, `${m.emoji} ${m.nome}`);
  escrever(nomeFundoEl, nomeFundo());
  btnFoto.disabled = roleta.ativa;
}

function montarFoto() {
  const m = MONSTROS[monstroAtual];
  const pad = Math.round(W * 0.03), topo = Math.round(H * 0.2), rodape = Math.round(H * 0.16);
  const c = document.createElement('canvas');
  c.width = W + pad * 2;
  c.height = H + topo + rodape;
  const g = c.getContext('2d');
  const fundo = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, c.width * 0.7);
  fundo.addColorStop(0, '#2a0508');
  fundo.addColorStop(1, '#050505');
  g.fillStyle = fundo;
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(tela, pad, topo, W, H);
  g.strokeStyle = m.cor;
  g.lineWidth = Math.max(3, W * 0.004);
  g.shadowColor = m.cor;
  g.shadowBlur = W * 0.015;
  g.strokeRect(pad, topo, W, H);
  g.shadowBlur = 0;

  g.textBaseline = 'middle';
  desenharLogo(g, pad, topo * 0.22, topo * 0.56, 'left');
  g.textAlign = 'center';
  g.font = `${Math.round(topo * 0.62)}px ${FONTE_TERROR}`;
  g.shadowColor = '#ff0000';
  g.shadowBlur = topo * 0.2;
  g.fillStyle = '#ff2b2b';
  g.fillText(CONFIG.titulo, c.width / 2, topo * 0.52);
  g.shadowBlur = 0;
  g.font = `${Math.round(topo * 0.6)}px ${FONTE_EMOJI}`;
  g.textAlign = 'right';
  g.fillText(m.emoji, c.width - pad, topo * 0.52);

  const yRod = topo + H + rodape / 2;
  g.textAlign = 'left';
  g.font = `${Math.round(rodape * 0.48)}px ${FONTE_TERROR}`;
  g.fillStyle = m.cor;
  g.shadowColor = m.cor;
  g.shadowBlur = rodape * 0.15;
  g.fillText(`VOCÊ VIROU: ${m.nome}`, pad, yRod);
  g.shadowBlur = 0;
  g.textAlign = 'right';
  g.font = `${Math.round(rodape * 0.36)}px ${FONTE_VHS}`;
  g.fillStyle = '#e8e8e8';
  g.fillText(`${CONFIG.rodape} · ${new Date().toLocaleDateString('pt-BR')}`, c.width - pad, yRod);
  return c.toDataURL('image/jpeg', 0.92);
}

async function capturarFoto() {
  const dados = montarFoto();
  som.obturador();
  flashEl.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flashEl.classList.remove('on')));
  foto.fase = 'preview';
  foto.t0 = t;
  fotoImg.src = dados;
  fotoMsg.textContent = 'GERANDO SEU QR CODE...';
  qrPainel.classList.add('carregando');
  qrPainel.classList.remove('sem-qr');
  fotoEl.classList.remove('oculto');
  try {
    const r = await fetch('api/foto', { method: 'POST', body: dados });
    if (!r.ok) throw new Error(await r.text());
    const { url } = await r.json();
    if (url) {
      desenharQR(qrCanvas, url);
      qrPainel.classList.remove('carregando');
      fotoMsg.textContent = 'O celular precisa estar no mesmo Wi-Fi deste computador';
    } else {
      qrPainel.classList.add('sem-qr');
      fotoMsg.textContent = 'FOTO SALVA ✔ (sem rede para o QR code)';
    }
  } catch (e) {
    console.warn('Falha ao salvar no servidor, baixando pelo navegador:', e);
    const a = document.createElement('a');
    a.href = dados;
    a.download = `monstro-${Date.now()}.jpg`;
    a.click();
    qrPainel.classList.add('sem-qr');
    fotoMsg.textContent = 'FOTO BAIXADA NESTE COMPUTADOR ✔';
  }
}

function quadro(agora) {
  requestAnimationFrame(quadro);
  const dt = Math.min(0.1, (agora - ultimoFrame) / 1000);
  ultimoFrame = agora;
  t = agora / 1000;
  if (video.readyState < 2) return;

  const t0 = performance.now();
  if (video.currentTime !== ultimoTempoVideo) {
    ultimoTempoVideo = video.currentTime;
    quadrosVideo++;
    const res = landmarker.detectForVideo(video, agora);
    suavizar(res.faceLandmarks || []);
    // o recorte da pessoa muda pouco entre quadros: roda em quadros alternados
    if (segmentador && cenarioAtual >= 0 && (quadrosVideo % 2 === 0 || !mascaraPronta)) atualizarMascaraPessoa(agora);
    // gestos só a cada 3 quadros: basta para perceber a mão parada e economiza processamento
    if (reconhecedorGestos && quadrosVideo % 3 === 1) atualizarGesto(agora);
  }
  const t1 = performance.now();
  // o formato do rosto muda junto com a transformação
  const mAtual = monstro();
  const forca = (() => { const k = Math.max(0, Math.min(1, (progresso() - 0.1) / 0.7)); return k * k * (3 - 2 * k); })();
  const deformados = suavizados.map((lm) => deformarRosto(lm, mAtual, forca * CONFIG.intensidadeDeformacao, W, H));
  geos = deformados.map((lm) => geometria(lm, W, H));
  atualizarRoleta();
  atualizarInfeccao(dt);
  atualizarFoto();
  desenharCena();
  desenharSobre();
  const m = monstro();
  const i = MONSTROS.indexOf(m);
  render.desenhar({
    cena: comp, sobre, rostos: suavizados.map((orig, j) => ({ orig, def: deformados[j] })), textura: texturas[i], prog: progresso(),
    brilho: m.brilho, tempo: t, modo, glitch,
  });
  if (foto.fase === 'disparo') capturarFoto();
  atualizarControles();
  medirDesempenho(agora, t1 - t0, performance.now() - t1);
}

// ===================== MEDIDOR DE DESEMPENHO (tecla D) =====================
let mostrarDesempenho = false;
const desempenho = { quadros: 0, desde: 0, fps: 0, ia: 0, desenho: 0 };

function medirDesempenho(agora, msIa, msDesenho) {
  desempenho.quadros++;
  desempenho.ia += (msIa - desempenho.ia) * 0.1;
  desempenho.desenho += (msDesenho - desempenho.desenho) * 0.1;
  if (agora - desempenho.desde >= 1000) {
    desempenho.fps = Math.round((desempenho.quadros * 1000) / (agora - desempenho.desde));
    desempenho.quadros = 0;
    desempenho.desde = agora;
  }
  // texto num elemento HTML (e não no canvas) para não aparecer nas fotos
  if (mostrarDesempenho) {
    desempenhoEl.textContent = `${desempenho.fps} qps · IA ${desempenho.ia.toFixed(0)} ms · desenho ${desempenho.desenho.toFixed(0)} ms · ${W}x${H}`;
  }
}

// ============================ INICIALIZAÇÃO ============================
function status(msg, erro = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('erro', erro);
}

async function criarComFallback(Tarefa, arquivos, opcoes) {
  try {
    return await Tarefa.createFromOptions(arquivos, opcoes('GPU'));
  } catch (e) {
    console.warn('GPU indisponível, usando CPU:', e);
    return await Tarefa.createFromOptions(arquivos, opcoes('CPU'));
  }
}

async function carregarModelos() {
  const arquivos = await FilesetResolver.forVisionTasks('vendor/wasm');
  landmarker = await criarComFallback(FaceLandmarker, arquivos, (delegate) => ({
    baseOptions: { modelAssetPath: 'vendor/face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: CONFIG.maxRostos,
  }));
  segmentador = await criarComFallback(ImageSegmenter, arquivos, (delegate) => ({
    baseOptions: { modelAssetPath: 'vendor/selfie_segmenter.tflite', delegate },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  }));
  if (CONFIG.fotoPorGesto) {
    // opcional: se o modelo de gestos faltar ou falhar, o espelho segue funcionando só com os botões
    try {
      reconhecedorGestos = await criarComFallback(GestureRecognizer, arquivos, (delegate) => ({
        baseOptions: { modelAssetPath: 'vendor/gesture_recognizer.task', delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      }));
      dicaGestoEl.classList.remove('oculto');
    } catch (e) {
      console.warn('Reconhecimento de gestos indisponível:', e);
    }
  }
}

async function iniciarCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((ok) => (video.onloadedmetadata = ok));
  await video.play();
  W = video.videoWidth || 1280;
  H = video.videoHeight || 720;
  for (const c of [comp, sobre, pessoa, rastro]) { c.width = W; c.height = H; }
  render.redimensionar(W, H);
}

function trocarModo(novo) {
  modo = (novo + MODOS.length) % MODOS.length;
  glitch = 1;
  som.estatica(0.3);
  try { localStorage.setItem('zumbi-modo', String(modo)); } catch {}
}

function escolherMonstro(i) {
  roleta.ativa = false;
  modoMonstro = 'fixo';
  monstroAtual = i;
  glitch = 1;
  som.estatica(0.3);
}

function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

// ------------------------- tela de abertura -------------------------
function montarAbertura() {
  const cartas = $('cartas');
  cartas.innerHTML = '';
  MONSTROS.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'carta';
    d.style.setProperty('--cor', m.cor);
    d.style.setProperty('--atraso', `${i * 0.35}s`);
    d.innerHTML = `<span class="emoji">${m.emoji}</span><span class="nome">${m.nome}</span>`;
    cartas.appendChild(d);
  });
  if (logoImg) {
    const img = $('logoAbertura');
    img.src = logoImg.src;
    img.classList.remove('oculto');
    $('seloAbertura').classList.add('oculto');
  }
  // slideshow com os cenários gerados por IA
  if (cenarios.length) {
    const slides = [$('slideA'), $('slideB')];
    let atual = 0, k = Math.floor(Math.random() * cenarios.length);
    const trocar = () => {
      const prox = slides[1 - atual];
      prox.style.backgroundImage = `url("${cenarios[k % cenarios.length].src}")`;
      prox.classList.remove('ativo');
      void prox.offsetWidth;
      prox.classList.add('ativo');
      slides[atual].classList.remove('ativo');
      atual = 1 - atual;
      k++;
    };
    trocar();
    setInterval(() => { if (!inicioEl.classList.contains('oculto')) trocar(); }, 6000);
  }
}

let cameraLigada = false;

// volta para a tela de abertura e deixa tudo pronto para a próxima pessoa (roleta automática)
function voltarAoInicio() {
  if (foto.fase === 'preview') fecharPreview();
  foto.fase = 'ocioso';
  roleta.ativa = false;
  modoMonstro = 'roleta';
  infeccao = 0;
  tinhaRosto = false;
  semRostoHa = 99;
  inicioEl.classList.remove('oculto');
}

btnComecar.addEventListener('click', async () => {
  if (cameraLigada) {
    // câmera e animação já estão rodando: só esconde a abertura
    inicioEl.classList.add('oculto');
    som.estatica(0.8);
    glitch = 1;
    return;
  }
  btnComecar.disabled = true;
  status('Pedindo acesso à câmera...');
  som.iniciar();
  document.documentElement.requestFullscreen?.().catch(() => {});
  try {
    await iniciarCamera();
  } catch (e) {
    console.error(e);
    status('Não consegui abrir a câmera. Verifique se ela está conectada, se outro programa (Teams, Zoom) não está usando e se o navegador tem permissão.', true);
    btnComecar.disabled = false;
    return;
  }
  cameraLigada = true;
  inicioEl.classList.add('oculto');
  som.estatica(0.8);
  glitch = 1;
  requestAnimationFrame(quadro);
});

window.addEventListener('keydown', (e) => {
  if (!inicioEl.classList.contains('oculto')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter') { e.preventDefault(); iniciarFoto(); }
  else if (k >= '1' && k <= String(MONSTROS.length)) escolherMonstro(Number(k) - 1);
  else if (k === '0' || k === 'r') { modoMonstro = 'roleta'; sortearCenario(); iniciarRoleta(); }
  else if (k === 'i' || k === 'home' || k === 'backspace') { e.preventDefault(); voltarAoInicio(); }
  else if (k === 'm') trocarModo(modo + 1);
  else if (k === 'z') { roleta.ativa = false; infeccao = 0.999; }
  else if (k === 'c') trocarCenario(cenarios.length ? (cenarioAtual + 1) % cenarios.length : -1);
  else if (k === 'v') trocarCenario(cenarioAtual >= 0 ? -1 : 0);
  else if (k === 's') { som.ligado = !som.ligado; }
  else if (k === 'f') telaCheia();
  else if (k === 'h') ajudaEl.classList.toggle('oculto');
  else if (k === 'd') { mostrarDesempenho = !mostrarDesempenho; desempenhoEl.classList.toggle('oculto', !mostrarDesempenho); }
  else if (k === 'escape' && foto.fase === 'preview') fecharPreview();
});
// botões: tiram o foco depois do clique para o ESPAÇO não "clicar" de novo no último botão usado
const botao = (el, acao) => el.addEventListener('click', (e) => { e.currentTarget.blur(); acao(); });
botao(btnMonstro, proximoMonstro);
botao(btnFoto, iniciarFoto);
botao(btnFundo, proximoFundo);
botao(btnFecharFoto, fecharPreview);

let timerCursor;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('sem-cursor');
  clearTimeout(timerCursor);
  timerCursor = setTimeout(() => document.body.classList.add('sem-cursor'), 2500);
});

(async () => {
  try {
    render = criarRenderizador(tela);
    status('Preparando os monstros...');
    await Promise.all([
      document.fonts.load('40px VT323').catch(() => {}),
      document.fonts.load('40px Creepster').catch(() => {}),
      carregarLogo(),
    ]);
    texturas = criarTexturas().map((c) => render.texturaMonstro(c));
    status('Carregando a inteligência artificial...');
    await carregarModelos();
    await carregarCenarios();
    montarAbertura();
    status(`Pronto! ${MONSTROS.length} monstros · ${cenarios.length} cenários${logoImg ? '' : ' · (logo provisório: coloque marca/logo-tv1.png)'}`);
    btnComecar.querySelector('span').textContent = 'ENTRAR... SE TIVER CORAGEM';
    btnComecar.disabled = false;
  } catch (e) {
    console.error(e);
    status(`Erro ao carregar: ${e.message || e}`, true);
  }
})();

// estado para diagnóstico pelo console do navegador (ex.: __estado())
window.__estado = () => ({ roleta: { ...roleta }, infeccao, monstroAtual, modoMonstro, t, agora: performance.now() / 1000, rostos: suavizados.length });
