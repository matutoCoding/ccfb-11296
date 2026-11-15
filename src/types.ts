// ---------- 数据模型 ----------

export type GlassTextureKind = 'flat' | 'ripple' | 'bubbles';

export interface GlassType {
  id: string;
  name: string;
  /** 玻璃颜色,hex,如 '#c8202f' */
  color: string;
  /** 透光率 0..1 */
  opacity: number;
  /** 肌理 */
  texture: GlassTextureKind;
  /** 肌理尺度(每米重复次数) */
  textureScale: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  /** 多边形顶点,窗口局部坐标(米),原点在窗洞左下角,y 向上 */
  points: Vec2[];
  glassId: string;
}

export interface Pattern {
  pieces: Piece[];
  /** 铅条宽度(毫米) */
  leadWidth: number;
}

export interface ProjectEnv {
  /** 纬度(度,北纬为正) */
  lat: number;
  /** 经度(度,东经为正) */
  lon: number;
  /** 时区(UTC 偏移小时,东八区为 8) */
  timezone: number;
  /** 日期 'YYYY-MM-DD' */
  date: string;
  /** 一天中的时间(分钟,0..1439) */
  timeMinutes: number;
  /** 窗户朝向:外法线的方位角(度,北0东90南180西270) */
  facingAzimuth: number;
  /** 窗洞宽(米) */
  windowWidth: number;
  /** 窗洞高(米) */
  windowHeight: number;
  /** 窗台高(米,窗洞下沿距室内地面) */
  sillHeight: number;
  /** 房间宽(米,沿窗墙) */
  roomWidth: number;
  /** 房间进深(米) */
  roomDepth: number;
  /** 房间层高(米) */
  roomHeight: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pattern: Pattern;
  glass: GlassType[];
  env: ProjectEnv;
}

export interface AppSettings {
  /** 新建项目的默认环境 */
  defaultEnv: ProjectEnv;
  /** 图案纹理分辨率(每米像素) */
  patternPPM: number;
  /** 肌理法线贴图分辨率 */
  normalMapSize: number;
  /** 折射扭曲强度(等效玻璃厚度,米) */
  refractStrength: number;
  /** 焦散增益强度 */
  causticGain: number;
  /** 太阳视角半径导致的边缘柔化(米,窗面处) */
  sunSoftness: number;
  /** 铅条颜色 */
  leadColor: string;
}

export const TEXTURE_KIND_NAMES: Record<GlassTextureKind, string> = {
  flat: '平板玻璃',
  ripple: '波纹玻璃',
  bubbles: '气泡玻璃',
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function defaultEnv(): ProjectEnv {
  return {
    lat: 31.23,
    lon: 121.47,
    timezone: 8,
    date: '2026-06-21',
    timeMinutes: 10 * 60,
    facingAzimuth: 180,
    windowWidth: 1.8,
    windowHeight: 2.4,
    sillHeight: 0.9,
    roomWidth: 6,
    roomDepth: 8,
    roomHeight: 3.2,
  };
}

export function defaultGlassLibrary(): GlassType[] {
  const mk = (
    name: string,
    color: string,
    opacity: number,
    texture: GlassTextureKind,
    textureScale = 6,
  ): GlassType => ({ id: uid(), name, color, opacity, texture, textureScale });
  return [
    mk('宝石红', '#b81f2d', 0.85, 'flat'),
    mk('琥珀黄', '#e09a1f', 0.8, 'ripple', 8),
    mk('钴蓝', '#1f3fae', 0.85, 'flat'),
    mk('祖母绿', '#1e7a3c', 0.8, 'bubbles', 10),
    mk('紫罗兰', '#6b2d8f', 0.8, 'ripple', 6),
    mk('乳白', '#e8e2d2', 0.55, 'bubbles', 12),
  ];
}

/** 生成一个演示图案(哥特尖拱分块) */
export function defaultPattern(env: ProjectEnv): Pattern {
  const w = env.windowWidth;
  const h = env.windowHeight;
  const pieces: Piece[] = [];
  const g = (i: number) => `__demo_${i}`;
  // 简单网格 + 拱顶扇形分块
  const cols = 4;
  const rows = 3;
  const rectH = h * 0.62;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = (w / cols) * c;
      const x1 = (w / cols) * (c + 1);
      const y0 = (rectH / rows) * r;
      const y1 = (rectH / rows) * (r + 1);
      pieces.push({
        id: uid(),
        glassId: g((r * cols + c) % 6),
        points: [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      });
    }
  }
  // 拱顶:以 (w/2, rectH) 为圆心的扇形
  const cx = w / 2;
  const cy = rectH;
  const R = Math.min(w / 2, h - rectH);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI - (Math.PI / segs) * i;
    const a1 = Math.PI - (Math.PI / segs) * (i + 1);
    pieces.push({
      id: uid(),
      glassId: g((i + 2) % 6),
      points: [
        { x: cx, y: cy },
        { x: cx + R * Math.cos(a0), y: cy + R * Math.sin(a0) },
        { x: cx + R * Math.cos((a0 + a1) / 2), y: cy + R * Math.sin((a0 + a1) / 2) },
        { x: cx + R * Math.cos(a1), y: cy + R * Math.sin(a1) },
      ],
    });
  }
  return { pieces, leadWidth: 12 };
}

export function createProject(name: string, env: ProjectEnv): Project {
  const glass = defaultGlassLibrary();
  const pattern = defaultPattern(env);
  // 把演示图案的占位 glassId 替换成真实库 id
  pattern.pieces.forEach((p, i) => {
    const m = p.glassId.match(/^__demo_(\d+)$/);
    p.glassId = glass[m ? parseInt(m[1], 10) % glass.length : i % glass.length].id;
  });
  const now = Date.now();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    pattern,
    glass,
    env: { ...env },
  };
}
