// ---------- 光照预览页:太阳位置 + 3D 预览 + 时间轴 + 截图 ----------

import { Project } from '../types';
import { loadSettings, upsertProject } from '../store';
import { sunPosition, sunDirectionLocal } from '../sun';
import { buildNormalMaps, buildPatternMaps } from '../patternTexture';
import { Renderer, buildSceneGeometry } from '../gl/renderer';
import { el, field, formatMinutes, numberInput, selectInput } from './dom';
import { toast } from '../main';

const CITIES = [
  { name: '自定义', lat: NaN, lon: NaN },
  { name: '北京', lat: 39.9, lon: 116.4 },
  { name: '上海', lat: 31.23, lon: 121.47 },
  { name: '广州', lat: 23.13, lon: 113.26 },
  { name: '成都', lat: 30.57, lon: 104.07 },
  { name: '哈尔滨', lat: 45.8, lon: 126.53 },
  { name: '拉萨', lat: 29.65, lon: 91.1 },
  { name: '乌鲁木齐', lat: 43.82, lon: 87.62 },
  { name: '香港', lat: 22.32, lon: 114.17 },
];

export function renderPreviewPage(page: HTMLElement, project: Project): () => void {
  page.className = 'page wide';
  const settings = loadSettings();

  // ---- 渲染器 ----
  const canvas = document.createElement('canvas');
  canvas.className = 'preview3d';
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    page.append(el('div', { className: 'empty' }, [(err as Error).message]));
    return () => {};
  }
  renderer.setSettings(settings);
  renderer.setNormalMaps(buildNormalMaps(settings));

  const rebuildScene = () => {
    renderer.setGeometry(buildSceneGeometry(project));
    renderer.setPatternMaps(buildPatternMaps(project, settings));
  };
  rebuildScene();

  // ---- 相机轨道 ----
  const cam = { yaw: 0, pitch: 0.06, dist: project.env.roomDepth * 0.8, target: [0, 0, 0] as number[] };
  const resetTarget = () => {
    cam.target = [0, project.env.sillHeight + project.env.windowHeight * 0.35, 0];
  };
  resetTarget();

  const eyePos = (): number[] => [
    cam.target[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    Math.max(0.15, cam.target[1] + cam.dist * Math.sin(cam.pitch)),
    cam.target[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  ];

  const applyCamera = () => {
    const eye = eyePos();
    renderer.setCamera(eye, cam.target, eye[2] < -0.15);
  };

  const setView = (outdoor: boolean) => {
    resetTarget();
    if (outdoor) {
      cam.yaw = Math.PI * 1.08;
      cam.pitch = 0.05;
      cam.dist = Math.max(4, project.env.windowWidth * 2.2);
    } else {
      cam.yaw = 0.12;
      cam.pitch = 0.2;
      cam.dist = project.env.roomDepth * 0.82;
    }
    applyCamera();
    render();
  };

  // ---- 太阳 ----
  const sunInfo = el('div', { className: 'suninfo' }, []);
  const computeSun = () => {
    const env = project.env;
    const sp = sunPosition(env.lat, env.lon, env.timezone, env.date, env.timeMinutes);
    const dir = sunDirectionLocal(sp.azimuth, sp.elevation, env.facingAzimuth);
    const sinEl = Math.sin((sp.elevation * Math.PI) / 180);
    const intensity = sp.up ? Math.pow(Math.max(0, sinEl), 0.55) * 2.6 : 0;
    const warm = Math.min(1, Math.max(0, sinEl * 4));
    const color: [number, number, number] = [
      1,
      0.55 + 0.43 * warm,
      0.3 + 0.62 * warm,
    ];
    renderer.setSun({
      dir,
      on: sp.up && intensity > 0.01,
      color: [color[0] * intensity, color[1] * intensity, color[2] * intensity],
    });
    const inFront = dir[2] < 0;
    sunInfo.innerHTML = '';
    sunInfo.append(
      el('span', {}, [`太阳方位角 `, el('b', {}, [`${sp.azimuth.toFixed(1)}°`])]),
      el('span', {}, [`高度角 `, el('b', {}, [`${sp.elevation.toFixed(1)}°`])]),
      el('span', {}, [
        sp.up
          ? inFront
            ? '阳光正射入此窗'
            : '太阳在窗户背面一侧,无直射光进入'
          : '太阳在地平线以下',
      ]),
    );
  };

  const render = () => {
    computeSun();
    applyCamera();
    renderer.render();
  };

  const saveEnv = () => upsertProject(project);

  // ---- 交互:轨道 ----
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    cam.yaw -= (e.clientX - lastX) * 0.006;
    cam.pitch = Math.min(1.4, Math.max(-0.2, cam.pitch + (e.clientY - lastY) * 0.006));
    lastX = e.clientX;
    lastY = e.clientY;
    render();
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cam.dist = Math.min(30, Math.max(0.8, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    render();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const onResize = () => render();
  window.addEventListener('resize', onResize);

  // ---- 时间轴 ----
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  timeSlider.max = '1439';
  timeSlider.step = '1';
  timeSlider.value = String(project.env.timeMinutes);
  const clock = el('span', { className: 'clock' }, [formatMinutes(project.env.timeMinutes)]);
  timeSlider.addEventListener('input', () => {
    project.env.timeMinutes = parseInt(timeSlider.value, 10);
    clock.textContent = formatMinutes(project.env.timeMinutes);
    render();
  });
  timeSlider.addEventListener('change', saveEnv);

  let playing = false;
  let playTimer = 0;
  const playBtn = el('button', {
    className: 'small',
    onclick: () => {
      playing = !playing;
      playBtn.textContent = playing ? '⏸ 暂停' : '▶ 播放';
      if (playing) {
        playTimer = window.setInterval(() => {
          project.env.timeMinutes = (project.env.timeMinutes + 4) % 1440;
          timeSlider.value = String(project.env.timeMinutes);
          clock.textContent = formatMinutes(project.env.timeMinutes);
          render();
        }, 80);
      } else {
        clearInterval(playTimer);
        saveEnv();
      }
    },
  }, ['▶ 播放']);

  // ---- 地点 / 日期 / 朝向控件 ----
  const env = project.env;
  const citySel = selectInput(
    CITIES.map((c) => ({ value: c.name, label: c.name })),
    '自定义',
    (v) => {
      const c = CITIES.find((x) => x.name === v);
      if (c && !Number.isNaN(c.lat)) {
        env.lat = c.lat;
        env.lon = c.lon;
        env.timezone = 8;
        saveEnv();
        refreshLocationInputs();
        render();
      }
    },
  );

  const latInput = numberInput(env.lat, { min: -90, max: 90, step: 0.01, onChange: (v) => { env.lat = v; saveEnv(); render(); } });
  const lonInput = numberInput(env.lon, { min: -180, max: 180, step: 0.01, onChange: (v) => { env.lon = v; saveEnv(); render(); } });
  const tzInput = numberInput(env.timezone, { min: -12, max: 14, step: 1, onChange: (v) => { env.timezone = v; saveEnv(); render(); } });
  function refreshLocationInputs(): void {
    latInput.value = String(env.lat);
    lonInput.value = String(env.lon);
    tzInput.value = String(env.timezone);
  }

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = env.date;
  dateInput.addEventListener('change', () => {
    if (dateInput.value) {
      env.date = dateInput.value;
      saveEnv();
      render();
    }
  });

  const facingSel = selectInput(
    [
      { value: '0', label: '北' },
      { value: '90', label: '东' },
      { value: '180', label: '南' },
      { value: '270', label: '西' },
    ],
    String([0, 90, 180, 270].includes(env.facingAzimuth) ? env.facingAzimuth : '180'),
    (v) => {
      env.facingAzimuth = parseInt(v, 10);
      saveEnv();
      render();
    },
  );

  // ---- 尺寸面板 ----
  const dimField = (label: string, get: () => number, set: (v: number) => void, min: number, max: number) =>
    field(label, numberInput(get(), {
      min, max, step: 0.1,
      onChange: (v) => { set(v); saveEnv(); rebuildScene(); render(); },
    }));
  const dimsPanel = el('details', { className: 'panel' }, [
    el('summary', {}, ['窗洞与房间尺寸']),
    el('div', { className: 'grid2' }, [
      dimField('窗宽 (m)', () => env.windowWidth, (v) => { env.windowWidth = v; }, 0.3, 12),
      dimField('窗高 (m)', () => env.windowHeight, (v) => { env.windowHeight = v; }, 0.3, 12),
      dimField('窗台高 (m)', () => env.sillHeight, (v) => { env.sillHeight = v; }, 0, 6),
      dimField('房间宽 (m)', () => env.roomWidth, (v) => { env.roomWidth = v; }, 1, 30),
      dimField('房间进深 (m)', () => env.roomDepth, (v) => { env.roomDepth = v; }, 1, 40),
      dimField('房间层高 (m)', () => env.roomHeight, (v) => { env.roomHeight = v; }, 2, 15),
    ]),
    el('div', { className: 'hint' }, ['提示:改窗洞尺寸后,图案坐标会等比留在原位置,超出的部分被裁掉。']),
  ]);

  // ---- 截图 ----
  const screenshot = () => {
    render();
    const dataUrl = renderer.toDataURL();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const sp = sunPosition(env.lat, env.lon, env.timezone, env.date, env.timeMinutes);
      const lines = [
        `项目:${project.name}`,
        `日期时间:${env.date} ${formatMinutes(env.timeMinutes)} (UTC${env.timezone >= 0 ? '+' : ''}${env.timezone})`,
        `地点:${env.lat.toFixed(2)}°, ${env.lon.toFixed(2)}°  窗朝向:${env.facingAzimuth}°`,
        `太阳:方位 ${sp.azimuth.toFixed(1)}° 高度 ${sp.elevation.toFixed(1)}°`,
        `窗洞:${env.windowWidth}×${env.windowHeight} m  铅条:${project.pattern.leadWidth} mm`,
      ];
      const fs = Math.max(14, Math.round(c.width / 70));
      ctx.font = `${fs}px "Microsoft YaHei", sans-serif`;
      const pad = fs * 0.6;
      const boxH = lines.length * (fs + pad * 0.6) + pad * 2;
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
      ctx.fillStyle = 'rgba(20,16,28,0.72)';
      ctx.fillRect(10, c.height - boxH - 10, boxW, boxH);
      ctx.fillStyle = '#fff';
      lines.forEach((l, i) => {
        ctx.fillText(l, 10 + pad, c.height - boxH - 10 + pad + (i + 0.75) * (fs + pad * 0.6));
      });
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `${project.name}_${env.date}_${formatMinutes(env.timeMinutes).replace(':', '')}.png`;
      a.click();
      toast('截图已保存(含项目参数)');
    };
    img.src = dataUrl;
  };

  // ---- 布局 ----
  const viewInBtn = el('button', { className: 'small primary', onclick: () => setView(false) }, ['室内视角']);
  const viewOutBtn = el('button', { className: 'small', onclick: () => setView(true) }, ['室外视角']);
  const syncViewButtons = () => {
    // 简单处理:点击时切换样式
  };
  void syncViewButtons;
  viewInBtn.addEventListener('click', () => { viewInBtn.className = 'small primary'; viewOutBtn.className = 'small'; });
  viewOutBtn.addEventListener('click', () => { viewOutBtn.className = 'small primary'; viewInBtn.className = 'small'; });

  page.append(
    el('div', { className: 'toolbar' }, [
      el('h1', {}, [`光照预览 — ${project.name}`]),
      viewInBtn,
      viewOutBtn,
      el('button', { className: 'small', onclick: screenshot }, ['📷 截图(带参数)']),
      el('span', { className: 'hint' }, ['拖动旋转视角,滚轮缩放']),
    ]),
    el('div', { className: 'split' }, [
      el('div', { className: 'side' }, [
        el('div', { className: 'panel' }, [
          el('h2', {}, ['地点与日期']),
          el('div', { className: 'grid2' }, [
            field('城市预设', citySel),
            field('日期', dateInput),
            field('纬度 (°)', latInput),
            field('经度 (°)', lonInput),
            field('时区 (UTC+)', tzInput),
            field('窗朝向', facingSel),
          ]),
        ]),
        el('div', { className: 'panel' }, [
          el('h2', {}, ['时间轴']),
          el('div', { className: 'timeline' }, [playBtn, timeSlider, clock]),
          el('div', { style: 'height:8px' }, []),
          sunInfo,
        ]),
        dimsPanel,
      ]),
      el('div', { className: 'main' }, [canvas]),
    ]),
  );

  setView(false);

  return () => {
    if (playTimer) clearInterval(playTimer);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
  };
}
