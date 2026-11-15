// ---------- 项目列表页:增删改复制 / 导入导出 ----------

import { createProject } from '../types';
import {
  deleteProject,
  duplicateProject,
  exportProject,
  getCurrentProjectId,
  loadProjects,
  loadSettings,
  parseProjectImport,
  setCurrentProjectId,
  upsertProject,
} from '../store';
import { el } from './dom';
import { toast } from '../main';

function download(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function renderProjectsPage(page: HTMLElement): () => void {
  page.className = 'page';

  const render = () => {
    page.innerHTML = '';
    page.append(el('h1', {}, ['项目列表']));

    // 新建 / 导入工具条
    const nameInput = document.createElement('input');
    nameInput.placeholder = '新项目名称,如:圣弥额尔堂东窗';
    nameInput.style.width = '260px';
    const createBtn = el('button', { className: 'primary', onclick: () => {
      const name = nameInput.value.trim() || '未命名项目';
      const p = createProject(name, loadSettings().defaultEnv);
      upsertProject(p);
      setCurrentProjectId(p.id);
      toast(`已创建项目「${name}」`);
      location.hash = '#/editor';
    } }, ['新建项目']);

    const importBtn = el('button', { onclick: () => fileInput.click() }, ['导入项目 (.json)']);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const p = parseProjectImport(await f.text());
        upsertProject(p);
        setCurrentProjectId(p.id);
        toast(`已导入项目「${p.name}」`);
        render();
      } catch (err) {
        toast('导入失败:' + (err as Error).message);
      }
      fileInput.value = '';
    });

    page.append(el('div', { className: 'toolbar' }, [nameInput, createBtn, importBtn, fileInput]));

    const projects = loadProjects().sort((a, b) => b.updatedAt - a.updatedAt);
    if (projects.length === 0) {
      page.append(el('div', { className: 'empty' }, ['还没有项目,先新建一个吧。新建后会带一个演示图案,可以直接去「光照预览」看效果。']));
      return;
    }

    const curId = getCurrentProjectId();
    const cards = el('div', { className: 'cards' }, []);
    for (const p of projects) {
      const isCur = p.id === curId;
      const card = el('div', { className: 'card' }, [
        el('div', { className: 'name' }, [p.name, ...(isCur ? [' ', el('span', { className: 'badge' }, ['当前']) as Node] : [])]),
        el('div', { className: 'meta' }, [
          `${p.pattern.pieces.length} 块玻璃 · 窗 ${p.env.windowWidth}×${p.env.windowHeight} m`,
        ]),
        el('div', { className: 'meta' }, [
          `更新于 ${new Date(p.updatedAt).toLocaleString('zh-CN')}`,
        ]),
        el('div', { className: 'actions' }, [
          el('button', { className: 'small primary', onclick: () => {
            setCurrentProjectId(p.id);
            location.hash = '#/preview';
          } }, ['打开']),
          el('button', { className: 'small', onclick: () => {
            setCurrentProjectId(p.id);
            location.hash = '#/editor';
          } }, ['编辑图案']),
          el('button', { className: 'small', onclick: () => {
            const copy = duplicateProject(p.id);
            if (copy) {
              toast(`已复制为「${copy.name}」`);
              render();
            }
          } }, ['复制']),
          el('button', { className: 'small', onclick: () => {
            download(`${p.name}.stainedglass.json`, exportProject(p));
          } }, ['导出']),
          el('button', { className: 'small danger', onclick: () => {
            if (confirm(`确定删除项目「${p.name}」?此操作不可恢复。`)) {
              deleteProject(p.id);
              render();
            }
          } }, ['删除']),
        ]),
      ]);
      cards.append(card);
    }
    page.append(cards);
  };

  render();
  return () => {};
}
