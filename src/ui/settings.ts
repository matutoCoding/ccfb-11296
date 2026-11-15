// ---------- 设置页:全局默认与渲染参数 ----------

import { defaultSettings, loadSettings, saveSettings } from '../store';
import { el, field, numberInput } from './dom';
import { toast } from '../main';

export function renderSettingsPage(page: HTMLElement): () => void {
  page.className = 'page';
  const settings = loadSettings();

  const render = () => {
    page.innerHTML = '';
    page.append(el('h1', {}, ['设置']));

    const env = settings.defaultEnv;
    const envPanel = el('div', { className: 'panel' }, [
      el('h2', {}, ['新建项目的默认环境']),
      el('div', { className: 'grid2' }, [
        field('纬度 (°)', numberInput(env.lat, { min: -90, max: 90, step: 0.01, onChange: (v) => { env.lat = v; } })),
        field('经度 (°)', numberInput(env.lon, { min: -180, max: 180, step: 0.01, onChange: (v) => { env.lon = v; } })),
        field('时区 (UTC+)', numberInput(env.timezone, { min: -12, max: 14, step: 1, onChange: (v) => { env.timezone = v; } })),
        field('窗朝向 (方位角°)', numberInput(env.facingAzimuth, { min: 0, max: 360, step: 5, onChange: (v) => { env.facingAzimuth = v; } })),
        field('窗宽 (m)', numberInput(env.windowWidth, { min: 0.3, max: 12, step: 0.1, onChange: (v) => { env.windowWidth = v; } })),
        field('窗高 (m)', numberInput(env.windowHeight, { min: 0.3, max: 12, step: 0.1, onChange: (v) => { env.windowHeight = v; } })),
        field('窗台高 (m)', numberInput(env.sillHeight, { min: 0, max: 6, step: 0.1, onChange: (v) => { env.sillHeight = v; } })),
        field('房间宽 (m)', numberInput(env.roomWidth, { min: 1, max: 30, step: 0.5, onChange: (v) => { env.roomWidth = v; } })),
        field('房间进深 (m)', numberInput(env.roomDepth, { min: 1, max: 40, step: 0.5, onChange: (v) => { env.roomDepth = v; } })),
        field('房间层高 (m)', numberInput(env.roomHeight, { min: 2, max: 15, step: 0.1, onChange: (v) => { env.roomHeight = v; } })),
      ]),
    ]);

    const renderPanel = el('div', { className: 'panel' }, [
      el('h2', {}, ['渲染参数']),
      el('div', { className: 'grid2' }, [
        field('图案纹理精度 (像素/米)', numberInput(settings.patternPPM, {
          min: 128, max: 2048, step: 64,
          onChange: (v) => { settings.patternPPM = v; },
        })),
        field('肌理法线贴图尺寸', numberInput(settings.normalMapSize, {
          min: 128, max: 1024, step: 128,
          onChange: (v) => { settings.normalMapSize = v; },
        })),
        field('折射扭曲强度', numberInput(settings.refractStrength, {
          min: 0, max: 0.1, step: 0.002,
          onChange: (v) => { settings.refractStrength = v; },
        })),
        field('焦散增益强度', numberInput(settings.causticGain, {
          min: 0, max: 5, step: 0.1,
          onChange: (v) => { settings.causticGain = v; },
        })),
        field('光斑边缘柔化 (弧度)', numberInput(settings.sunSoftness, {
          min: 0, max: 0.03, step: 0.001,
          onChange: (v) => { settings.sunSoftness = v; },
        })),
        field('铅条颜色', (() => {
          const c = document.createElement('input');
          c.type = 'color';
          c.value = settings.leadColor;
          c.addEventListener('input', () => { settings.leadColor = c.value; });
          return c;
        })()),
      ]),
      el('p', { className: 'hint' }, [
        '折射扭曲模拟光线穿过起伏玻璃表面的偏折(等效厚度,米);焦散增益控制光斑内亮暗聚拢的程度;边缘柔化来自太阳约 0.53° 的视角直径。修改渲染参数后重新进入光照预览生效。',
      ]),
    ]);

    page.append(
      envPanel,
      el('div', { style: 'height:14px' }, []),
      renderPanel,
      el('div', { style: 'height:14px' }, []),
      el('div', { className: 'row' }, [
        el('button', {
          className: 'primary',
          onclick: () => {
            saveSettings(settings);
            toast('设置已保存');
          },
        }, ['保存设置']),
        el('button', {
          onclick: () => {
            Object.assign(settings, defaultSettings());
            saveSettings(settings);
            render();
            toast('已恢复默认设置');
          },
        }, ['恢复默认']),
      ]),
    );
  };

  render();
  return () => {};
}
