// ---------- 图案编辑页:多边形分块 + 铅条 + SVG 导入 ----------

import { GlassType, Piece, Project, Vec2, uid } from '../types';
import { upsertProject } from '../store';
import { ensureCCW, pointInPolygon, distToSegment, polygonArea } from '../geometry';
import { fitPolygonsToWindow, parseSvgToPolygons } from '../svg';
import { hexToRgb } from '../patternTexture';
import { el, field, selectInput } from './dom';
import { toast } from '../main';

type Tool = 'select' | 'draw';

export function renderEditorPage(page: HTMLElement, project: Project): () => void {
  page.className = 'page wide';

  let tool: Tool = 'select';
  let selectedId: string | null = null;
  let drawPoints: Vec2[] = [];
  let hoverWorld: Vec2 | null = null;
  let dragVertex = -1;
  let dragMove: { start: Vec2; orig: Vec2[] } | null = null;
  let activeGlassId = project.glass[0]?.id ?? '';
  const undoStack: string[] = [];

  const W = () => project.env.windowWidth;
  const H = () => project.env.windowHeight;

  // ---- 画布 ----
  const canvas = document.createElement('canvas');
  canvas.className = 'editor';
  const ctx = canvas.getContext('2d')!;
  let scale = 100;
  let margin = 40;

  const toScreen = (p: Vec2): Vec2 => ({ x: margin + p.x * scale, y: canvas.clientHeight - margin - p.y * scale });
  const toWorld = (sx: number, sy: number): Vec2 => ({
    x: (sx - margin) / scale,
    y: (canvas.clientHeight - margin - sy) / scale,
  });

  function resize(): void {
    const parent = canvas.parentElement!;
    const w = parent.clientWidth;
    const h = Math.max(420, window.innerHeight - 140);
    canvas.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    margin = 40;
    scale = Math.min((w - margin * 2) / W(), (h - margin * 2) / H());
    draw();
  }

  const glassById = () => new Map<string, GlassType>(project.glass.map((g) => [g.id, g]));

  function draw(): void {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    const glasses = glassById();

    // 窗洞外区域
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, cw, ch);
    const o = toScreen({ x: 0, y: 0 });
    ctx.fillStyle = '#fdfcf9';
    ctx.fillRect(o.x, o.y - H() * scale, W() * scale, H() * scale);

    // 网格(0.1 m)
    ctx.strokeStyle = '#eee9e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W() + 1e-9; x += 0.1) {
      const s = toScreen({ x, y: 0 });
      ctx.moveTo(s.x, toScreen({ x, y: 0 }).y);
      ctx.lineTo(s.x, toScreen({ x, y: H() }).y);
    }
    for (let y = 0; y <= H() + 1e-9; y += 0.1) {
      ctx.moveTo(toScreen({ x: 0, y }).x, toScreen({ x: 0, y }).y);
      ctx.lineTo(toScreen({ x: W(), y }).x, toScreen({ x: 0, y }).y);
    }
    ctx.stroke();

    // 玻璃块
    const leadPx = Math.max(1, (project.pattern.leadWidth / 1000) * scale);
    for (const piece of project.pattern.pieces) {
      const glass = glasses.get(piece.glassId);
      const rgb = glass ? hexToRgb(glass.color) : [200, 200, 200];
      const alpha = glass ? glass.opacity : 0.7;
      ctx.beginPath();
      piece.points.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.fill();
      ctx.strokeStyle = '#2b2b2e';
      ctx.lineWidth = leadPx;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // 窗洞边框
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y - H() * scale, W() * scale, H() * scale);

    // 选中块:顶点手柄
    const sel = project.pattern.pieces.find((p) => p.id === selectedId);
    if (sel) {
      ctx.strokeStyle = '#7a4fbf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      sel.points.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      for (const p of sel.points) {
        const s = toScreen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#7a4fbf';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 正在绘制的多边形
    if (tool === 'draw' && drawPoints.length > 0) {
      ctx.beginPath();
      drawPoints.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      if (hoverWorld) {
        const s = toScreen(hoverWorld);
        ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = '#7a4fbf';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of drawPoints) {
        const s = toScreen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#7a4fbf';
        ctx.fill();
      }
    }
  }

  // ---- 数据操作 ----
  const pushUndo = () => {
    undoStack.push(JSON.stringify(project.pattern));
    if (undoStack.length > 60) undoStack.shift();
  };
  const commit = () => {
    upsertProject(project);
    draw();
    updateSide();
  };
  const undo = () => {
    const prev = undoStack.pop();
    if (!prev) return;
    project.pattern = JSON.parse(prev);
    selectedId = null;
    commit();
  };

  const selectedPiece = () => project.pattern.pieces.find((p) => p.id === selectedId);

  function hitVertex(w: Vec2): number {
    const sel = selectedPiece();
    if (!sel) return -1;
    const tol = 9 / scale;
    for (let i = 0; i < sel.points.length; i++) {
      if (Math.hypot(sel.points[i].x - w.x, sel.points[i].y - w.y) < tol) return i;
    }
    return -1;
  }

  function hitPiece(w: Vec2): Piece | null {
    for (let i = project.pattern.pieces.length - 1; i >= 0; i--) {
      const p = project.pattern.pieces[i];
      if (pointInPolygon(w, p.points)) return p;
    }
    return null;
  }

  // ---- 指针交互 ----
  const posOf = (e: PointerEvent): Vec2 => {
    const r = canvas.getBoundingClientRect();
    return toWorld(e.clientX - r.left, e.clientY - r.top);
  };

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const w = posOf(e);
    if (tool === 'draw') {
      // 靠近起点则闭合
      if (drawPoints.length >= 3) {
        const s0 = toScreen(drawPoints[0]);
        const r = canvas.getBoundingClientRect();
        if (Math.hypot(e.clientX - r.left - s0.x, e.clientY - r.top - s0.y) < 12) {
          closePolygon();
          return;
        }
      }
      drawPoints.push({ x: clamp(w.x, 0, W()), y: clamp(w.y, 0, H()) });
      draw();
      return;
    }
    // select 工具
    const vi = hitVertex(w);
    if (vi >= 0) {
      pushUndo();
      dragVertex = vi;
      return;
    }
    const hit = hitPiece(w);
    if (hit) {
      if (hit.id !== selectedId) {
        selectedId = hit.id;
        updateSide();
        draw();
      }
      pushUndo();
      dragMove = { start: w, orig: hit.points.map((p) => ({ ...p })) };
    } else {
      selectedId = null;
      updateSide();
      draw();
    }
  };

  const onMove = (e: PointerEvent) => {
    const w = posOf(e);
    hoverWorld = w;
    if (dragVertex >= 0) {
      const sel = selectedPiece();
      if (sel) {
        sel.points[dragVertex] = { x: clamp(w.x, 0, W()), y: clamp(w.y, 0, H()) };
        draw();
      }
      return;
    }
    if (dragMove) {
      const sel = selectedPiece();
      if (sel) {
        const dx = w.x - dragMove.start.x;
        const dy = w.y - dragMove.start.y;
        sel.points = dragMove.orig.map((p) => ({
          x: clamp(p.x + dx, 0, W()),
          y: clamp(p.y + dy, 0, H()),
        }));
        draw();
      }
      return;
    }
    if (tool === 'draw') draw();
  };

  const onUp = () => {
    if (dragVertex >= 0 || dragMove) {
      dragVertex = -1;
      dragMove = null;
      commit();
    }
  };

  const onDblClick = (e: MouseEvent) => {
    if (tool === 'draw') {
      closePolygon();
      return;
    }
    // select:在选中块的边上插入顶点
    const sel = selectedPiece();
    if (!sel) return;
    const r = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    const tol = 8 / scale;
    for (let i = 0; i < sel.points.length; i++) {
      const a = sel.points[i];
      const b = sel.points[(i + 1) % sel.points.length];
      if (distToSegment(w, a, b) < tol) {
        pushUndo();
        sel.points.splice(i + 1, 0, { x: w.x, y: w.y });
        commit();
        return;
      }
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    const sel = selectedPiece();
    if (!sel) return;
    const r = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    const vi = hitVertex(w);
    if (vi >= 0 && sel.points.length > 3) {
      e.preventDefault();
      pushUndo();
      sel.points.splice(vi, 1);
      commit();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = selectedPiece();
      if (sel && document.activeElement === document.body) {
        pushUndo();
        project.pattern.pieces = project.pattern.pieces.filter((p) => p.id !== sel.id);
        selectedId = null;
        commit();
      }
    } else if (e.key === 'Enter' && tool === 'draw') {
      closePolygon();
    } else if (e.key === 'Escape') {
      drawPoints = [];
      draw();
    }
  };

  function closePolygon(): void {
    if (drawPoints.length >= 3) {
      pushUndo();
      const piece: Piece = {
        id: uid(),
        points: ensureCCW(drawPoints.map((p) => ({ ...p }))),
        glassId: activeGlassId,
      };
      project.pattern.pieces.push(piece);
      selectedId = piece.id;
      commit();
    }
    drawPoints = [];
    draw();
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', resize);

  // ---- 侧栏 ----
  const side = el('div', { className: 'side' }, []);
  const glassSelWrap = el('div', {}, []);
  const selInfo = el('div', { className: 'hint' }, []);

  function updateSide(): void {
    const glasses = project.glass;
    glassSelWrap.innerHTML = '';
    const sel = selectedPiece();
    const current = sel ? sel.glassId : activeGlassId;
    glassSelWrap.append(
      field('玻璃材质', selectInput(
        glasses.map((g) => ({ value: g.id, label: g.name })),
        current,
        (v) => {
          activeGlassId = v;
          if (sel) {
            pushUndo();
            sel.glassId = v;
            commit();
          }
        },
      )),
    );
    selInfo.textContent = sel
      ? `已选:${sel.points.length} 个顶点,面积约 ${Math.abs(polygonArea(sel.points)).toFixed(3)} m²`
      : tool === 'draw'
        ? '单击加点;双击 / 回车 / 点起点闭合;Esc 取消'
        : '单击选择玻璃块;拖动顶点整形;双击边插入顶点;右键顶点删除;Delete 删除整块';
  }

  const toolSelect = el('button', { className: 'small', onclick: () => { tool = 'select'; syncToolButtons(); } }, ['选择 / 顶点']);
  const toolDraw = el('button', { className: 'small', onclick: () => { tool = 'draw'; drawPoints = []; syncToolButtons(); } }, ['画多边形']);
  function syncToolButtons(): void {
    toolSelect.className = 'small' + (tool === 'select' ? ' primary' : '');
    toolDraw.className = 'small' + (tool === 'draw' ? ' primary' : '');
    updateSide();
    draw();
  }
  syncToolButtons();

  const leadRange = document.createElement('input');
  leadRange.type = 'range';
  leadRange.min = '2';
  leadRange.max = '40';
  leadRange.step = '1';
  leadRange.value = String(project.pattern.leadWidth);
  const leadVal = el('span', {}, [`${project.pattern.leadWidth} mm`]);
  leadRange.addEventListener('input', () => {
    project.pattern.leadWidth = parseInt(leadRange.value, 10);
    leadVal.textContent = `${project.pattern.leadWidth} mm`;
    draw();
  });
  leadRange.addEventListener('change', () => upsertProject(project));

  const svgInput = document.createElement('input');
  svgInput.type = 'file';
  svgInput.accept = '.svg,image/svg+xml';
  svgInput.style.display = 'none';
  svgInput.addEventListener('change', async () => {
    const f = svgInput.files?.[0];
    svgInput.value = '';
    if (!f) return;
    try {
      const res = parseSvgToPolygons(await f.text());
      const polys = fitPolygonsToWindow(res, W(), H());
      pushUndo();
      for (const pts of polys) {
        project.pattern.pieces.push({ id: uid(), points: ensureCCW(pts), glassId: activeGlassId });
      }
      commit();
      toast(`已导入 ${polys.length} 个分块`);
    } catch (err) {
      toast('SVG 导入失败:' + (err as Error).message);
    }
  });

  side.append(
    el('div', { className: 'panel' }, [
      el('h2', {}, ['工具']),
      el('div', { className: 'row' }, [toolSelect, toolDraw]),
      el('div', { className: 'row' }, [
        el('button', { className: 'small', onclick: undo }, ['撤销 (Ctrl+Z)']),
        el('button', { className: 'small danger', onclick: () => {
          if (confirm('清空全部玻璃分块?')) {
            pushUndo();
            project.pattern.pieces = [];
            selectedId = null;
            commit();
          }
        } }, ['清空']),
      ]),
      el('div', { className: 'row' }, [
        el('button', { className: 'small', onclick: () => svgInput.click() }, ['导入 SVG 拆块']),
        svgInput,
      ]),
    ]),
    el('div', { className: 'panel' }, [
      el('h2', {}, ['玻璃与铅条']),
      glassSelWrap,
      field('铅条宽度', el('div', { className: 'row' }, [leadRange, leadVal])),
    ]),
    el('div', { className: 'panel' }, [el('h2', {}, ['状态']), selInfo]),
  );

  page.append(
    el('div', { className: 'toolbar' }, [
      el('h1', {}, [`图案编辑 — ${project.name}`]),
      el('span', { className: 'hint' }, [`窗洞 ${W()} × ${H()} m,坐标单位:米`]),
    ]),
    el('div', { className: 'split' }, [side, el('div', { className: 'main' }, [canvas])]),
  );

  updateSide();
  requestAnimationFrame(resize);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
  };
}
