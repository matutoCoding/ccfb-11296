// ---------- 玻璃材质页:管理当前项目的玻璃库 ----------

import { GlassTextureKind, Project, TEXTURE_KIND_NAMES, uid } from '../types';
import { upsertProject } from '../store';
import { el, numberInput, selectInput } from './dom';
import { toast } from '../main';

export function renderMaterialsPage(page: HTMLElement, project: Project): () => void {
  page.className = 'page';

  const save = () => upsertProject(project);

  const render = () => {
    page.innerHTML = '';
    page.append(el('h1', {}, [`玻璃材质 — ${project.name}`]));

    const usageCount = (gid: string) =>
      project.pattern.pieces.filter((p) => p.glassId === gid).length;

    const table = el('table', { className: 'mat' }, []);
    table.append(
      el('tr', {}, [
        el('th', {}, ['颜色']),
        el('th', {}, ['名称']),
        el('th', {}, ['透光率']),
        el('th', {}, ['肌理']),
        el('th', {}, ['肌理密度 (次/米)']),
        el('th', {}, ['使用块数']),
        el('th', {}, ['操作']),
      ]),
    );

    for (const g of project.glass) {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = g.color;
      colorInput.addEventListener('input', () => {
        g.color = colorInput.value;
        swatch.style.background = g.color;
        save();
      });
      const swatch = el('span', { className: 'glass-swatch' }, []);
      swatch.style.background = g.color;

      const nameInput = document.createElement('input');
      nameInput.value = g.name;
      nameInput.style.width = '110px';
      nameInput.addEventListener('change', () => {
        g.name = nameInput.value.trim() || g.name;
        save();
      });

      const opacityRange = document.createElement('input');
      opacityRange.type = 'range';
      opacityRange.min = '0.05';
      opacityRange.max = '1';
      opacityRange.step = '0.05';
      opacityRange.value = String(g.opacity);
      const opacityVal = el('span', { className: 'hint' }, [g.opacity.toFixed(2)]);
      opacityRange.addEventListener('input', () => {
        g.opacity = parseFloat(opacityRange.value);
        opacityVal.textContent = g.opacity.toFixed(2);
        save();
      });

      const textureSel = selectInput<GlassTextureKind>(
        (Object.keys(TEXTURE_KIND_NAMES) as GlassTextureKind[]).map((k) => ({
          value: k,
          label: TEXTURE_KIND_NAMES[k],
        })),
        g.texture,
        (v) => {
          g.texture = v;
          save();
        },
      );

      table.append(
        el('tr', {}, [
          el('td', {}, [el('div', { className: 'row' }, [swatch, colorInput])]),
          el('td', {}, [nameInput]),
          el('td', {}, [el('div', { className: 'row' }, [opacityRange, opacityVal])]),
          el('td', {}, [textureSel]),
          el('td', {}, [
            numberInput(g.textureScale, {
              min: 1, max: 32, step: 1,
              onChange: (v) => { g.textureScale = v; save(); },
            }),
          ]),
          el('td', {}, [String(usageCount(g.id))]),
          el('td', {}, [
            el('button', {
              className: 'small danger',
              onclick: () => {
                const n = usageCount(g.id);
                const msg = n > 0
                  ? `「${g.name}」正被 ${n} 个分块使用,删除后这些分块将改用第一种玻璃。确定删除?`
                  : `确定删除「${g.name}」?`;
                if (!confirm(msg)) return;
                project.glass = project.glass.filter((x) => x.id !== g.id);
                if (project.glass.length === 0) {
                  project.glass.push({
                    id: uid(), name: '无色玻璃', color: '#dddddd',
                    opacity: 0.6, texture: 'flat', textureScale: 6,
                  });
                }
                const fallback = project.glass[0].id;
                for (const p of project.pattern.pieces) {
                  if (p.glassId === g.id) p.glassId = fallback;
                }
                save();
                render();
              },
            }, ['删除']),
          ]),
        ]),
      );
    }

    page.append(
      el('div', { className: 'toolbar' }, [
        el('button', {
          className: 'primary',
          onclick: () => {
            project.glass.push({
              id: uid(),
              name: `玻璃 ${project.glass.length + 1}`,
              color: '#c86a2d',
              opacity: 0.8,
              texture: 'flat',
              textureScale: 6,
            });
            save();
            render();
            toast('已添加新玻璃,可在图案编辑页指派给分块');
          },
        }, ['新增玻璃']),
        el('span', { className: 'hint' }, ['修改会立即保存,并同步到光照预览。']),
      ]),
      table,
      el('p', { className: 'hint' }, [
        '肌理说明:平板=光滑透明;波纹=连续起伏表面,光斑边缘扭曲;气泡=玻璃内含气泡,光斑带局部亮斑(焦散)。扭曲与焦散强度可在「设置」页调整。',
      ]),
    );
  };

  render();
  return () => {};
}
