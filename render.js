// Renderização em WebGL:
//  1) copia a cena 2D (fundo + pessoa) para um framebuffer;
//  2) desenha a malha 3D de cada rosto com a textura do monstro, preservando a luz real da pele;
//  3) aplica o filtro anos 90 (VHS / PS1 / CCTV) misturando a camada de efeitos 2D por cima.
import { UV, TRIANGULOS } from './malha.js';

// Triângulos que fecham os olhos e a boca: removidos para os olhos e a boca reais aparecerem.
const BURACOS = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
].map((a) => new Set(a));

function indicesDaMalha() {
  const saida = [];
  for (let i = 0; i < TRIANGULOS.length; i += 3) {
    const tri = [TRIANGULOS[i], TRIANGULOS[i + 1], TRIANGULOS[i + 2]];
    if (BURACOS.some((s) => tri.every((v) => s.has(v)))) continue;
    saida.push(...tri);
  }
  return new Uint16Array(saida);
}

const VS_QUAD = `
attribute vec2 a;
varying vec2 uv;
void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const FS_COPIA = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
void main() { gl_FragColor = vec4(texture2D(tex, uv).rgb, 1.0); }`;

const VS_ROSTO = `
attribute vec3 aPos;
attribute vec2 aUV;
varying vec2 vUV;
varying vec2 vTela;
void main() {
  vUV = aUV;
  vTela = aPos.xy * 0.5 + 0.5;
  gl_Position = vec4(aPos, 1.0);
}`;

const FS_ROSTO = `
precision highp float;
varying vec2 vUV;
varying vec2 vTela;
uniform sampler2D cena;
uniform sampler2D monstro;
uniform float prog;
uniform vec3 brilho;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec4 m = texture2D(monstro, vUV);
  vec3 base = texture2D(cena, vTela).rgb;
  // luz e sombra da pele real modulam a textura (o rosto continua "3D")
  float L = dot(base, vec3(0.299, 0.587, 0.114));
  float luz = 0.28 + 1.18 * smoothstep(0.02, 0.85, L);
  vec3 cor = m.rgb * luz;
  // a transformação se espalha pela pele em manchas
  float n = ruido(vUV * 6.0) * 0.65 + ruido(vUV * 17.0) * 0.35;
  float rev = smoothstep(n, n + 0.12, prog * 1.15);
  vec3 res = mix(base, cor, m.a * rev);
  float borda = rev * (1.0 - rev) * 4.0 * step(0.05, m.a);
  res += brilho * borda;
  gl_FragColor = vec4(res, 1.0);
}`;

const FS_POST = `
precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform sampler2D sobre;
uniform vec2 res;
uniform float time;
uniform float mode;
uniform float glitch;

float rnd(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 amostra(vec2 p) {
  vec4 o = texture2D(sobre, p);
  return mix(texture2D(tex, p).rgb, o.rgb, o.a);
}

vec3 vhs(vec2 p) {
  float linha = floor(p.y * res.y);
  float jitter = (rnd(vec2(linha, floor(time * 24.0))) - 0.5) * 0.0012;
  float faixaPos = fract(time * 0.11);
  float faixa = 1.0 - smoothstep(0.0, 0.035, abs(p.y - faixaPos));
  float gl = glitch * step(0.6, rnd(vec2(floor(p.y * 24.0), floor(time * 18.0))));
  p.x += jitter + faixa * 0.006 * sin(p.y * 300.0 + time * 40.0) + gl * (rnd(vec2(linha, time)) - 0.5) * 0.08;
  float ca = 0.0022 + 0.012 * glitch + faixa * 0.004;
  vec3 c;
  c.r = amostra(p + vec2(ca, 0.0)).r;
  c.g = amostra(p).g;
  c.b = amostra(p - vec2(ca, 0.0)).b;
  vec3 borrado = (amostra(p + vec2(0.0025, 0.0)) + amostra(p - vec2(0.0025, 0.0))) * 0.5;
  c = mix(c, borrado, 0.3);
  c = c * vec3(1.05, 1.0, 0.92) + vec3(0.03, 0.02, 0.04);
  c *= 0.88 + 0.12 * sin(gl_FragCoord.y * 1.5708);
  c += (rnd(p * res + fract(time) * 100.0) - 0.5) * 0.09;
  c += faixa * rnd(vec2(p.x * res.x * 0.3, floor(time * 60.0) + linha)) * 0.35;
  return c;
}

vec3 ps1(vec2 p) {
  float b = max(3.0, floor(res.y / 180.0));
  vec2 cel = floor(gl_FragCoord.xy / b);
  vec2 q = (cel * b + b * 0.5) / res;
  q.x += glitch * (rnd(vec2(cel.y, floor(time * 12.0))) - 0.5) * 0.04;
  vec3 c = amostra(q);
  float d = mod(cel.x + cel.y * 2.0, 4.0) / 4.0 - 0.375;
  c = floor(c * 10.0 + d + 0.5) / 10.0;
  c *= 0.93 + 0.07 * mod(cel.y, 2.0);
  return c;
}

vec3 cctv(vec2 p) {
  vec2 c0 = p - 0.5;
  p = 0.5 + c0 * (1.0 + 0.2 * dot(c0, c0)) * 0.94;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec3(0.0);
  p.x += glitch * (rnd(vec2(floor(p.y * 30.0), floor(time * 15.0))) - 0.5) * 0.05;
  float l = dot(amostra(p), vec3(0.299, 0.587, 0.114));
  l = (l - 0.5) * 1.3 + 0.5;
  l += (rnd(p * res + fract(time) * 50.0) - 0.5) * 0.2;
  float rola = fract(p.y - time * 0.2);
  l *= 0.88 + 0.12 * smoothstep(0.0, 0.08, rola);
  l *= 0.85 + 0.15 * sin(gl_FragCoord.y * 1.5708);
  return vec3(l) * vec3(0.78, 1.0, 0.8);
}

void main() {
  vec3 c;
  if (mode < 0.5) c = vhs(uv);
  else if (mode < 1.5) c = ps1(uv);
  else c = cctv(uv);
  vec2 v = uv - 0.5;
  c *= clamp(1.0 - dot(v, v) * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function criarRenderizador(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL indisponível neste navegador.');

  const compilar = (vs, fs) => {
    const shader = (tipo, src) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const cacheU = {};
    return {
      prog,
      u: (n) => (cacheU[n] ??= gl.getUniformLocation(prog, n)),
      a: (n) => gl.getAttribLocation(prog, n),
    };
  };

  const pCopia = compilar(VS_QUAD, FS_COPIA);
  const pRosto = compilar(VS_ROSTO, FS_ROSTO);
  const pPost = compilar(VS_QUAD, FS_POST);

  const bQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  // UV com v invertido porque as texturas sobem com UNPACK_FLIP_Y
  const bUV = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bUV);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(UV.flatMap(([u, v]) => [u, 1 - v])), gl.STATIC_DRAW);

  const indices = indicesDaMalha();
  const bIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const bPos = gl.createBuffer();
  const posicoes = new Float32Array(UV.length * 3);

  const novaTextura = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  const tCena = novaTextura();
  const tSobre = novaTextura();
  const tFinal = novaTextura();
  const fbo = gl.createFramebuffer();
  const rbo = gl.createRenderbuffer();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const enviar = (t, fonte) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
  };

  const quad = (p) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, bQuad);
    const loc = p.a('a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  let W = 1, H = 1;

  return {
    redimensionar(w, h) {
      W = w; H = h;
      canvas.width = w; canvas.height = h;
      gl.bindTexture(gl.TEXTURE_2D, tFinal);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rbo);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tFinal, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    texturaMonstro(fonte) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    },

    // rostos: listas de pontos normalizados {x, y, z} do MediaPipe (não espelhados)
    desenhar({ cena, sobre, rostos, textura, prog, brilho, tempo, modo, glitch }) {
      enviar(tCena, cena);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(pCopia.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tCena);
      gl.uniform1i(pCopia.u('tex'), 0);
      quad(pCopia);

      if (textura && rostos.length && prog > 0) {
        gl.useProgram(pRosto.prog);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tCena);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textura);
        gl.uniform1i(pRosto.u('cena'), 0);
        gl.uniform1i(pRosto.u('monstro'), 1);
        gl.uniform1f(pRosto.u('prog'), prog);
        gl.uniform3fv(pRosto.u('brilho'), brilho);

        const aUV = pRosto.a('aUV');
        gl.bindBuffer(gl.ARRAY_BUFFER, bUV);
        gl.enableVertexAttribArray(aUV);
        gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
        const aPos = pRosto.a('aPos');
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);

        for (const lm of rostos) {
          gl.clear(gl.DEPTH_BUFFER_BIT);
          for (let i = 0; i < UV.length; i++) {
            const p = lm[i];
            posicoes[i * 3] = 1 - 2 * p.x;          // espelhado
            posicoes[i * 3 + 1] = 1 - 2 * p.y;
            posicoes[i * 3 + 2] = Math.max(-0.99, Math.min(0.99, p.z * 4));
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
          gl.bufferData(gl.ARRAY_BUFFER, posicoes, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
          gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        gl.disableVertexAttribArray(aUV);
        gl.disable(gl.DEPTH_TEST);
      }

      enviar(tSobre, sobre);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(pPost.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tFinal);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tSobre);
      gl.uniform1i(pPost.u('tex'), 0);
      gl.uniform1i(pPost.u('sobre'), 1);
      gl.uniform2f(pPost.u('res'), W, H);
      gl.uniform1f(pPost.u('time'), tempo);
      gl.uniform1f(pPost.u('mode'), modo);
      gl.uniform1f(pPost.u('glitch'), glitch);
      quad(pPost);
    },
  };
}
