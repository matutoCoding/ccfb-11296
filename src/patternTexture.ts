// ---------- 图案与肌理纹理生成(Canvas2D 离屏) ----------
// colorMap: rgb=玻璃颜色, a=透光率(铅条处≈0)
// typeMap:  r=肌理类型(0/1/2), g=肌理尺度(每米重复次数/32), b=每块随机相位(法线采样偏移)

import { AppSettings, GlassTextureKind, GlassType, Project } from './types';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const KIND_ID: Record<GlassTextureKind, number> = { flat: 0, ripple: 1, bubbles:2 };

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export interface PatternMaps {
  color: HTMLCanvasElement;
  type: HTMLCanvasElement;
  width: number;
  height: number;
}

export function buildPatternMaps(project: Project, settings: AppSettings): PatternMaps {
  const { windowWidth: W, windowHeight: H } = project.env;
  const ppm = settings.patternPPM;
  const pw = Math.max(64, Math.round(W * ppm));
  const ph = Math.max(64, Math.round(H * ppm));

  const color = document.createElement('canvas');
  color.width = pw;
  color.height = ph;
  const cctx = color.getContext('2d')!;

  const type = document.createElement('canvas');
  type.width = pw;
  type.height = ph;
  const tctx = type.getContext('2d')!;

  // 背景:完全不透光(窗外框区域)
  cctx.fillStyle = 'rgba(0,0,0,0)';
  cctx.fillRect(0, 0, pw, ph);
  tctx.fillStyle = 'rgb(0,0,0)';
  tctx.fillRect(0, 0, pw, ph);

  const glassById = new Map<string, GlassType>(project.glass.map((g) => [g.id, g]));

  const toPx = (x: number, y: number): [number, number] => [x * ppm, ph - y * ppm];

  for (const piece of project.pattern.pieces) {
    const glass = glassById.get(piece.glassId);
    if (!glass || piece.points.length < 3) continue;
    const [r, g, b] = hexToRgb(glass.color);
    const path = new Path2D();
    piece.points.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    path.closePath();
    cctx.fillStyle = `rgba(${r},${g},${b},${glass.opacity})`;
    cctx.fill(path);
    const kindId = KIND_ID[glass.texture];
    const scaleByte = Math.round(Math.min(1, glass.textureScale / 32) * 255);
    const phaseByte = Math.round(hashStr(piece.id) * 255);
    tctx.fillStyle = `rgb(${kindId},${scaleByte},${phaseByte})`;
    tctx.fill(path);
  }

  // 铅条:沿每块边描边(相邻边重合,宽度一致)。alpha≈0 表示几乎不透光;
  // 直接观察玻璃时只用 rgb,铅条呈深色。
  const leadPx = Math.max(1, (project.pattern.leadWidth / 1000) * ppm);
  const [lr, lg, lb] = hexToRgb(settings.leadColor);
  cctx.strokeStyle = `rgba(${lr},${lg},${lb},0.02)`;
  cctx.lineWidth = leadPx;
  cctx.lineJoin = 'round';
  tctx.strokeStyle = 'rgb(255,0,0)'; // r=255 标记为铅条,着色器里不透光
  tctx.lineWidth = leadPx;
  tctx.lineJoin = 'round';
  for (const piece of project.pattern.pieces) {
    if (piece.points.length < 3) continue;
    const path = new Path2D();
    piece.points.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    path.closePath();
    cctx.stroke(path);
    tctx.stroke(path);
  }

  return { color, type, width: pw, height: ph };
}

// ---- 肌理法线贴图(可平铺) ----

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function heightToNormalCanvas(
  size: number,
  height: (u: number, v: number) => number,
  strength: number,
): HTMLCanvasElement {
  const hs = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) hs[y * size + x] = height(x / size, y / size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const H = (x: number, y: number) =>
    hs[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength * size * 0.5;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength * size * 0.5;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function buildNormalMaps(
  settings: AppSettings,
): Record<GlassTextureKind, HTMLCanvasElement> {
  const size = settings.normalMapSize;

  const flat = document.createElement('canvas');
  flat.width = flat.height = 16;
  const fctx = flat.getContext('2d')!;
  fctx.fillStyle = 'rgb(128,128,255)';
  fctx.fillRect(0, 0, 16, 16);

  // 波纹:几个整数波数的正弦叠加(可平铺)
  const ripple = heightToNormalCanvas(
    size,
    (u, v) =>
      Math.sin(2 * Math.PI * (3 * u + 0.6 * Math.sin(2 * Math.PI * v))) * 0.6 +
      Math.sin(2 * Math.PI * (5 * v + 0.8 * Math.sin(2 * Math.PI * 2 * u))) * 0.3 +
      Math.sin(2 * Math.PI * (2 * u + 2 * v)) * 0.25,
    0.5,
  );

  // 气泡:环面上随机分布的圆顶凸起
  const rand = mulberry32(20260621);
  const bubbles: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 90; i++) {
    bubbles.push({ x: rand(), y: rand(), r: 0.015 + rand() * 0.05 });
  }
  const bubble = heightToNormalCanvas(
    size,
    (u, v) => {
      let h = 0;
      for (const b of bubbles) {
        // 环面距离
        let dx = Math.abs(u - b.x);
        let dy = Math.abs(v - b.y);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < b.r) {
          const t = d / b.r;
          h += Math.cos(t * Math.PI * 0.5) ** 2;
        }
      }
      return h;
    },
    0.9,
  );

  return { flat, ripple, bubbles: bubble };
}
