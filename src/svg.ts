// ---------- SVG 导入:解析 path/polygon/rect/circle/ellipse,展平曲线为多边形 ----------

import { Vec2 } from './types';

type Mat = [number, number, number, number, number, number]; // a b c d e f

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function matApply(m: Mat, x: number, y: number): Vec2 {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function parseTransform(s: string | null): Mat {
  if (!s) return IDENT;
  let m: Mat = IDENT;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s))) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Mat = IDENT;
    switch (match[1]) {
      case 'matrix':
        t = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const r: Mat = [cos, sin, -sin, cos, 0, 0];
        if (args.length > 2) {
          t = matMul(matMul([1, 0, 0, 1, args[1], args[2]], r), [1, 0, 0, 1, -args[1], -args[2]]);
        } else {
          t = r;
        }
        break;
      }
      case 'skewX': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        t = [1, 0, Math.tan(a), 1, 0, 0];
        break;
      }
      case 'skewY': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        t = [1, Math.tan(a), 0, 1, 0, 0];
        break;
      }
    }
    m = matMul(m, t);
  }
  return m;
}

// ---- path 数据解析 ----

const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

export function flattenPath(d: string, curveSteps = 24): Vec2[][] {
  const tokens = d.match(CMD_RE) || [];
  const polys: Vec2[][] = [];
  let cur: Vec2[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0; // 当前点
  let sx = 0;
  let sy = 0; // 子路径起点
  let prevCtrl: Vec2 | null = null;

  const num = () => parseFloat(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const push = (x: number, y: number) => {
    cx = x;
    cy = y;
    cur.push({ x, y });
  };

  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd >= 'a' && cmd <= 'z';
    const C = cmd.toUpperCase();
    switch (C) {
      case 'M': {
        const x = num();
        const y = num();
        if (cur.length > 1) polys.push(cur);
        cur = [];
        push(rel ? cx + x : x, rel ? cy + y : y);
        sx = cx;
        sy = cy;
        cmd = rel ? 'l' : 'L'; // 后续隐式为 L
        prevCtrl = null;
        break;
      }
      case 'L': {
        while (hasNum()) {
          const x = num();
          const y = num();
          push(rel ? cx + x : x, rel ? cy + y : y);
        }
        prevCtrl = null;
        break;
      }
      case 'H': {
        while (hasNum()) {
          const x = num();
          push(rel ? cx + x : x, cy);
        }
        prevCtrl = null;
        break;
      }
      case 'V': {
        while (hasNum()) {
          const y = num();
          push(cx, rel ? cy + y : y);
        }
        prevCtrl = null;
        break;
      }
      case 'C': {
        while (hasNum()) {
          const x1 = rel ? cx + num() : num();
          const y1 = rel ? cy + num() : num();
          const x2 = rel ? cx + num() : num();
          const y2 = rel ? cy + num() : num();
          const x = rel ? cx + num() : num();
          const y = rel ? cy + num() : num();
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const mt = 1 - t;
            cur.push({
              x: mt ** 3 * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x,
              y: mt ** 3 * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y,
            });
          }
          prevCtrl = { x: x2, y: y2 };
          cx = x;
          cy = y;
        }
        break;
      }
      case 'S': {
        while (hasNum()) {
          const x1 = prevCtrl ? 2 * cx - prevCtrl.x : cx;
          const y1 = prevCtrl ? 2 * cy - prevCtrl.y : cy;
          const x2 = rel ? cx + num() : num();
          const y2 = rel ? cy + num() : num();
          const x = rel ? cx + num() : num();
          const y = rel ? cy + num() : num();
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const mt = 1 - t;
            cur.push({
              x: mt ** 3 * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x,
              y: mt ** 3 * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y,
            });
          }
          prevCtrl = { x: x2, y: y2 };
          cx = x;
          cy = y;
        }
        break;
      }
      case 'Q': {
        while (hasNum()) {
          const x1 = rel ? cx + num() : num();
          const y1 = rel ? cy + num() : num();
          const x = rel ? cx + num() : num();
          const y = rel ? cy + num() : num();
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const mt = 1 - t;
            cur.push({
              x: mt * mt * cx + 2 * mt * t * x1 + t * t * x,
              y: mt * mt * cy + 2 * mt * t * y1 + t * t * y,
            });
          }
          prevCtrl = { x: x1, y: y1 };
          cx = x;
          cy = y;
        }
        break;
      }
      case 'T': {
        while (hasNum()) {
          const x1: number = prevCtrl ? 2 * cx - prevCtrl.x : cx;
          const y1: number = prevCtrl ? 2 * cy - prevCtrl.y : cy;
          const x = rel ? cx + num() : num();
          const y = rel ? cy + num() : num();
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const mt = 1 - t;
            cur.push({
              x: mt * mt * cx + 2 * mt * t * x1 + t * t * x,
              y: mt * mt * cy + 2 * mt * t * y1 + t * t * y,
            });
          }
          prevCtrl = { x: x1, y: y1 };
          cx = x;
          cy = y;
        }
        break;
      }
      case 'A': {
        while (hasNum()) {
          const rx = num();
          const ry = num();
          const rot = num();
          const large = num();
          const sweep = num();
          const x = rel ? cx + num() : num();
          const y = rel ? cy + num() : num();
          for (const p of flattenArc(cx, cy, rx, ry, rot, large, sweep, x, y, curveSteps)) {
            cur.push(p);
          }
          cx = x;
          cy = y;
          prevCtrl = null;
        }
        break;
      }
      case 'Z': {
        if (cur.length > 1) {
          // 去掉与起点重复的末点
          const last = cur[cur.length - 1];
          if (Math.hypot(last.x - sx, last.y - sy) < 1e-9) cur.pop();
          if (cur.length >= 3) polys.push(cur);
        }
        cur = [];
        cx = sx;
        cy = sy;
        prevCtrl = null;
        break;
      }
      default:
        i++; // 未知命令,跳过防死循环
    }
  }
  if (cur.length >= 3) polys.push(cur);
  return polys;
}

/** 端点式圆弧参数化 -> 中心参数化,采样 */
function flattenArc(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
  steps: number,
): Vec2[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9 || (x1 === x2 && y1 === y2)) return [{ x: x2, y: y2 }];
  const phi = (rotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (largeArc === (sweep ? 1 : 0)) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(dth) / (Math.PI * 2)) * steps * 2));
  const out: Vec2[] = [];
  for (let sIdx = 1; sIdx <= n; sIdx++) {
    const t = th1 + (dth * sIdx) / n;
    out.push({
      x: cosP * rx * Math.cos(t) - sinP * ry * Math.sin(t) + cx,
      y: sinP * rx * Math.cos(t) + cosP * ry * Math.sin(t) + cy,
    });
  }
  return out;
}

function parsePoints(s: string | null): Vec2[] {
  if (!s) return [];
  const nums = s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const pts: Vec2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

export interface SvgImportResult {
  polygons: Vec2[][];
  /** 原始 SVG 单位下的包围盒 */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

/** 解析 SVG 文本,返回多边形集合(SVG 坐标系,y 向下) */
export function parseSvgToPolygons(svgText: string): SvgImportResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) {
    throw new Error('无法解析 SVG 文件');
  }
  const polygons: Vec2[][] = [];

  const walk = (el: Element, parentMat: Mat) => {
    const mat = matMul(parentMat, parseTransform(el.getAttribute('transform')));
    const tag = el.tagName.toLowerCase();
    let raw: Vec2[][] = [];
    if (tag === 'path') {
      const d = el.getAttribute('d');
      if (d) raw = flattenPath(d);
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = parsePoints(el.getAttribute('points'));
      if (pts.length >= 3) raw = [pts];
    } else if (tag === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      if (w > 0 && h > 0)
        raw = [[
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]];
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = tag === 'circle' ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('rx') || '0');
      const ry = tag === 'circle' ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('ry') || '0');
      if (rx > 0 && ry > 0) {
        const pts: Vec2[] = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
        }
        raw = [pts];
      }
    }
    for (const poly of raw) {
      const mapped = poly.map((p) => matApply(mat, p.x, p.y));
      if (mapped.length >= 3) polygons.push(mapped);
    }
    for (const child of Array.from(el.children)) walk(child, mat);
  };
  walk(root, IDENT);

  if (polygons.length === 0) throw new Error('SVG 中没有可导入的封闭图形');

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons)
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  return { polygons, bbox: { minX, minY, maxX, maxY } };
}

/**
 * 把 SVG 多边形映射到窗口坐标(米,y 向上,原点窗洞左下角),
 * 保持纵横比、居中放入窗洞。
 */
export function fitPolygonsToWindow(
  res: SvgImportResult,
  windowWidth: number,
  windowHeight: number,
): Vec2[][] {
  const { minX, minY, maxX, maxY } = res.bbox;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) throw new Error('SVG 图形尺寸为零');
  const scale = Math.min(windowWidth / w, windowHeight / h) * 0.98;
  const offX = (windowWidth - w * scale) / 2;
  const offY = (windowHeight - h * scale) / 2;
  return res.polygons.map((poly) =>
    poly.map((p) => ({
      x: (p.x - minX) * scale + offX,
      // y 翻转:SVG 向下为正,窗口坐标向上为正
      y: (maxY - p.y) * scale + offY,
    })),
  );
}
