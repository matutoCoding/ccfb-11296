// ---------- 2D 多边形工具 ----------

import { Vec2 } from './types';

export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** 保证逆时针(CCW) */
export function ensureCCW(pts: Vec2[]): Vec2[] {
  return polygonArea(pts) < 0 ? [...pts].reverse() : pts;
}

export function polygonCentroid(pts: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / pts.length, y: cy / pts.length };
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** 简单多边形三角化(耳切法),返回顶点索引三元组 */
export function triangulate(pts: Vec2[]): number[] {
  const ccw = ensureCCW(pts);
  const n = ccw.length;
  const idx: number[] = [];
  if (n < 3) return idx;
  const remaining = ccw.map((_, i) => i);
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  let guard = 0;
  while (remaining.length > 3 && guard++ < 10000) {
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const i0 = remaining[(i - 1 + remaining.length) % remaining.length];
      const i1 = remaining[i];
      const i2 = remaining[(i + 1) % remaining.length];
      const a = ccw[i0];
      const b = ccw[i1];
      const c = ccw[i2];
      if (cross(a, b, c) <= 1e-12) continue; // 凹角或共线
      let contains = false;
      for (const j of remaining) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = ccw[j];
        const d1 = cross(a, b, p);
        const d2 = cross(b, c, p);
        const d3 = cross(c, a, p);
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      idx.push(i0, i1, i2);
      remaining.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break; // 退化多边形,放弃
  }
  if (remaining.length === 3) idx.push(remaining[0], remaining[1], remaining[2]);
  return idx;
}
