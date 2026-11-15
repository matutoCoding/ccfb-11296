// ---------- WebGL2 渲染器:房间几何 + 太阳投影 + 玻璃 ----------

import { AppSettings, GlassTextureKind, Project } from '../types';
import { PatternMaps } from '../patternTexture';
import { GLASS_FS, GLASS_VS, ROOM_FS, ROOM_VS } from './shaders';

// ---- 最小 mat4(列主序) ----

export type Mat4 = Float32Array;

export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: number[], center: number[], up: number[]): Mat4 {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  zx /= len;
  zy /= len;
  zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// ---- 几何构建 ----

interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
}

function quad(
  mesh: MeshData,
  a: number[],
  b: number[],
  c: number[],
  d: number[],
  normal: number[],
  color: number[],
) {
  const idx = [a, b, c, a, c, d];
  for (const p of idx) {
    mesh.positions.push(p[0], p[1], p[2]);
    mesh.normals.push(normal[0], normal[1], normal[2]);
    mesh.colors.push(color[0], color[1], color[2]);
  }
}

const COL = {
  floor: [0.62, 0.55, 0.46],
  wall: [0.93, 0.9, 0.85],
  ceiling: [0.96, 0.94, 0.9],
  wallExt: [0.78, 0.75, 0.7],
  ground: [0.45, 0.5, 0.38],
  jamb: [0.85, 0.82, 0.78],
};

export interface SceneGeometry {
  indoor: MeshData;
  outdoor: MeshData;
  glass: { positions: number[]; uvs: number[] };
  windowRect: [number, number, number, number];
}

export function buildSceneGeometry(p: Project): SceneGeometry {
  const { roomWidth: rw, roomDepth: rd, roomHeight: rh } = p.env;
  const ww = Math.min(p.env.windowWidth, rw - 0.2);
  const wh = Math.min(p.env.windowHeight, rh - p.env.sillHeight - 0.1);
  const x0 = -ww / 2;
  const x1 = ww / 2;
  const y0 = p.env.sillHeight;
  const y1 = y0 + wh;
  const hx = rw / 2;
  const wallT = 0.15;

  const indoor: MeshData = { positions: [], normals: [], colors: [] };
  const outdoor: MeshData = { positions: [], normals: [], colors: [] };

  // 地板 / 天花 / 后墙 / 侧墙
  quad(indoor, [-hx, 0, 0], [hx, 0, 0], [hx, 0, rd], [-hx, 0, rd], [0, 1, 0], COL.floor);
  quad(indoor, [-hx, rh, 0], [-hx, rh, rd], [hx, rh, rd], [hx, rh, 0], [0, -1, 0], COL.ceiling);
  quad(indoor, [-hx, 0, rd], [hx, 0, rd], [hx, rh, rd], [-hx, rh, rd], [0, 0, -1], COL.wall);
  quad(indoor, [-hx, 0, 0], [-hx, 0, rd], [-hx, rh, rd], [-hx, rh, 0], [1, 0, 0], COL.wall);
  quad(indoor, [hx, 0, 0], [hx, rh, 0], [hx, rh, rd], [hx, 0, rd], [-1, 0, 0], COL.wall);

  // 窗墙内表面(z=0,挖窗洞):下、上、左、右四条
  quad(indoor, [-hx, 0, 0], [hx, 0, 0], [hx, y0, 0], [-hx, y0, 0], [0, 0, 1], COL.wall);
  quad(indoor, [-hx, y1, 0], [hx, y1, 0], [hx, rh, 0], [-hx, rh, 0], [0, 0, 1], COL.wall);
  quad(indoor, [-hx, y0, 0], [x0, y0, 0], [x0, y1, 0], [-hx, y1, 0], [0, 0, 1], COL.wall);
  quad(indoor, [x1, y0, 0], [hx, y0, 0], [hx, y1, 0], [x1, y1, 0], [0, 0, 1], COL.wall);

  // 窗墙外表面(z=-wallT,同样挖洞)
  quad(outdoor, [-hx, 0, -wallT], [-hx, y0, -wallT], [hx, y0, -wallT], [hx, 0, -wallT], [0, 0, -1], COL.wallExt);
  quad(outdoor, [-hx, y1, -wallT], [-hx, rh, -wallT], [hx, rh, -wallT], [hx, y1, -wallT], [0, 0, -1], COL.wallExt);
  quad(outdoor, [-hx, y0, -wallT], [-hx, y1, -wallT], [x0, y1, -wallT], [x0, y0, -wallT], [0, 0, -1], COL.wallExt);
  quad(outdoor, [x1, y0, -wallT], [x1, y1, -wallT], [hx, y1, -wallT], [hx, y0, -wallT], [0, 0, -1], COL.wallExt);

  // 窗洞侧壁(jamb)
  quad(outdoor, [x0, y0, 0], [x0, y0, -wallT], [x0, y1, -wallT], [x0, y1, 0], [1, 0, 0], COL.jamb);
  quad(outdoor, [x1, y0, 0], [x1, y1, 0], [x1, y1, -wallT], [x1, y0, -wallT], [-1, 0, 0], COL.jamb);
  quad(outdoor, [x0, y0, 0], [x1, y0, 0], [x1, y0, -wallT], [x0, y0, -wallT], [0, 1, 0], COL.jamb);
  quad(outdoor, [x0, y1, 0], [x0, y1, -wallT], [x1, y1, -wallT], [x1, y1, 0], [0, -1, 0], COL.jamb);

  // 室外地面
  const G = 25;
  quad(outdoor, [-G, 0, -wallT], [G, 0, -wallT], [G, 0, -G], [-G, 0, -G], [0, 1, 0], COL.ground);

  // 玻璃平面(窗洞中间)
  const gz = -wallT / 2;
  const glass = {
    positions: [x0, y0, gz, x1, y0, gz, x1, y1, gz, x0, y0, gz, x1, y1, gz, x0, y1, gz],
    uvs: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
  };

  return { indoor, outdoor, glass, windowRect: [x0, y0, x1, y1] };
}

// ---- 渲染器 ----

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

export interface SunState {
  dir: [number, number, number];
  on: boolean;
  color: [number, number, number];
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private roomProg: WebGLProgram;
  private glassProg: WebGLProgram;
  private roomU: Record<string, WebGLUniformLocation | null> = {};
  private glassU: Record<string, WebGLUniformLocation | null> = {};
  private indoorVAO: WebGLVertexArrayObject | null = null;
  private outdoorVAO: WebGLVertexArrayObject | null = null;
  private glassVAO: WebGLVertexArrayObject | null = null;
  private indoorCount = 0;
  private outdoorCount = 0;
  private glassCount = 0;
  private texPatternColor: WebGLTexture | null = null;
  private texPatternType: WebGLTexture | null = null;
  private texNormal: Partial<Record<GlassTextureKind, WebGLTexture>> = {};
  private windowRect: [number, number, number, number] = [-1, 0, 1, 2];
  private eye = [0, 1.6, 6];
  private target = [0, 1.5, 0];
  private sun: SunState = { dir: [0, 1, -1], on: false, color: [1, 1, 1] };
  private outdoorView = false;
  private settings: AppSettings | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true, // 截图需要
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.roomProg = link(gl, ROOM_VS, ROOM_FS);
    this.glassProg = link(gl, GLASS_VS, GLASS_FS);
    for (const name of [
      'uVP', 'uSunDir', 'uSunOn', 'uSunColor', 'uWindowRect', 'uPatternColor',
      'uPatternType', 'uNormalRipple', 'uNormalBubbles', 'uRefractStrength',
      'uCausticGain', 'uSunSoftness', 'uAmbient', 'uOutdoor',
    ]) {
      this.roomU[name] = gl.getUniformLocation(this.roomProg, name);
    }
    for (const name of ['uVP', 'uPatternColor', 'uEye', 'uSunDir', 'uSunOn', 'uSunColor', 'uOutdoorView']) {
      this.glassU[name] = gl.getUniformLocation(this.glassProg, name);
    }
    gl.enable(gl.DEPTH_TEST);
    // 不做背面剔除:房间几何同时有内外表面,双面绘制更稳妥
  }

  setSettings(s: AppSettings): void {
    this.settings = s;
  }

  private makeVAO(mesh: MeshData): { vao: WebGLVertexArrayObject; count: number } {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const mk = (loc: number, data: number[], size: number) => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    mk(0, mesh.positions, 3);
    mk(1, mesh.normals, 3);
    mk(2, mesh.colors, 3);
    gl.bindVertexArray(null);
    return { vao, count: mesh.positions.length / 3 };
  }

  setGeometry(geo: SceneGeometry): void {
    const gl = this.gl;
    if (this.indoorVAO) gl.deleteVertexArray(this.indoorVAO);
    if (this.outdoorVAO) gl.deleteVertexArray(this.outdoorVAO);
    if (this.glassVAO) gl.deleteVertexArray(this.glassVAO);
    const a = this.makeVAO(geo.indoor);
    this.indoorVAO = a.vao;
    this.indoorCount = a.count;
    const b = this.makeVAO(geo.outdoor);
    this.outdoorVAO = b.vao;
    this.outdoorCount = b.count;
    // 玻璃:位置 + uv
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.glass.positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ub = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.glass.uvs), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.glassVAO = vao;
    this.glassCount = geo.glass.positions.length / 3;
    this.windowRect = geo.windowRect;
  }

  private uploadCanvas(canvas: HTMLCanvasElement, filter: number, wrap: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return tex;
  }

  setPatternMaps(maps: PatternMaps): void {
    const gl = this.gl;
    if (this.texPatternColor) gl.deleteTexture(this.texPatternColor);
    if (this.texPatternType) gl.deleteTexture(this.texPatternType);
    this.texPatternColor = this.uploadCanvas(maps.color, gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.texPatternType = this.uploadCanvas(maps.type, gl.NEAREST, gl.CLAMP_TO_EDGE);
  }

  setNormalMaps(maps: Record<GlassTextureKind, HTMLCanvasElement>): void {
    const gl = this.gl;
    for (const kind of ['ripple', 'bubbles'] as GlassTextureKind[]) {
      if (this.texNormal[kind]) gl.deleteTexture(this.texNormal[kind]!);
      this.texNormal[kind] = this.uploadCanvas(maps[kind], gl.LINEAR, gl.REPEAT);
    }
  }

  setSun(sun: SunState): void {
    this.sun = sun;
  }

  setCamera(eye: number[], target: number[], outdoorView: boolean): void {
    this.eye = eye;
    this.target = target;
    this.outdoorView = outdoorView;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(): void {
    const gl = this.gl;
    const s = this.settings;
    if (!s) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const skyCol = this.outdoorView ? [0.55, 0.68, 0.82] : [0.08, 0.08, 0.09];
    gl.clearColor(skyCol[0], skyCol[1], skyCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = mat4Perspective((55 * Math.PI) / 180, aspect, 0.05, 100);
    const view = mat4LookAt(this.eye, this.target, [0, 1, 0]);
    const vp = mat4Mul(proj, view);

    // 房间
    gl.useProgram(this.roomProg);
    gl.uniformMatrix4fv(this.roomU.uVP, false, vp);
    gl.uniform3fv(this.roomU.uSunDir, this.sun.dir);
    gl.uniform1f(this.roomU.uSunOn, this.sun.on ? 1 : 0);
    gl.uniform3fv(this.roomU.uSunColor, this.sun.color);
    gl.uniform4fv(this.roomU.uWindowRect, this.windowRect);
    gl.uniform1f(this.roomU.uRefractStrength, s.refractStrength);
    gl.uniform1f(this.roomU.uCausticGain, s.causticGain);
    gl.uniform1f(this.roomU.uSunSoftness, s.sunSoftness);
    gl.uniform1f(this.roomU.uAmbient, this.outdoorView ? 0.35 : 0.22);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texPatternColor);
    gl.uniform1i(this.roomU.uPatternColor, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texPatternType);
    gl.uniform1i(this.roomU.uPatternType, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texNormal.ripple ?? null);
    gl.uniform1i(this.roomU.uNormalRipple, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texNormal.bubbles ?? null);
    gl.uniform1i(this.roomU.uNormalBubbles, 3);

    if (this.indoorVAO && this.indoorCount) {
      gl.uniform1f(this.roomU.uOutdoor, 0);
      gl.bindVertexArray(this.indoorVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.indoorCount);
    }
    if (this.outdoorVAO && this.outdoorCount) {
      gl.uniform1f(this.roomU.uOutdoor, 1);
      gl.bindVertexArray(this.outdoorVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.outdoorCount);
    }

    // 玻璃(双面)
    if (this.glassVAO && this.glassCount) {
      gl.useProgram(this.glassProg);
      gl.uniformMatrix4fv(this.glassU.uVP, false, vp);
      gl.uniform3fv(this.glassU.uEye, this.eye);
      gl.uniform3fv(this.glassU.uSunDir, this.sun.dir);
      gl.uniform1f(this.glassU.uSunOn, this.sun.on ? 1 : 0);
      gl.uniform3fv(this.glassU.uSunColor, this.sun.color);
      gl.uniform1f(this.glassU.uOutdoorView, this.outdoorView ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texPatternColor);
      gl.uniform1i(this.glassU.uPatternColor, 0);
      gl.bindVertexArray(this.glassVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.glassCount);
    }
    gl.bindVertexArray(null);
  }

  /** 当前画面 dataURL(须在 render 后同帧调用) */
  toDataURL(): string {
    return this.canvas.toDataURL('image/png');
  }
}
