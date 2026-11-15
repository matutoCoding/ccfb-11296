// ---------- 应用入口:外壳 + 哈希路由 ----------

import './style.css';
import { getCurrentProjectId, getProject } from './store';
import { renderProjectsPage } from './ui/projects';
import { renderEditorPage } from './ui/editor';
import { renderMaterialsPage } from './ui/materials';
import { renderPreviewPage } from './ui/preview';
import { renderSettingsPage } from './ui/settings';

const NAV = [
  { hash: '#/projects', label: '项目列表' },
  { hash: '#/editor', label: '图案编辑' },
  { hash: '#/materials', label: '玻璃材质' },
  { hash: '#/preview', label: '光照预览' },
  { hash: '#/settings', label: '设置' },
];

let cleanup: (() => void) | null = null;

export function toast(msg: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

function shell(): { nav: HTMLElement; page: HTMLElement } {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const nav = document.createElement('div');
  nav.className = 'topbar';
  const page = document.createElement('div');
  app.append(nav, page);
  return { nav, page };
}

function route(): void {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const hash = location.hash || '#/projects';
  const { nav, page } = shell();

  nav.append(Object.assign(document.createElement('span'), { className: 'brand', textContent: '⛪ 彩绘玻璃设计预览' }));
  for (const item of NAV) {
    const a = document.createElement('a');
    a.href = item.hash;
    a.textContent = item.label;
    if (hash.startsWith(item.hash)) a.className = 'active';
    nav.append(a);
  }
  nav.append(Object.assign(document.createElement('span'), { className: 'spacer' }));
  const curId = getCurrentProjectId();
  const cur = curId ? getProject(curId) : undefined;
  const curSpan = document.createElement('span');
  curSpan.className = 'cur';
  curSpan.textContent = cur ? `当前项目:${cur.name}` : '未选择项目';
  nav.append(curSpan);

  const needProject = ['#/editor', '#/materials', '#/preview'].some((h) => hash.startsWith(h));
  if (needProject && !cur) {
    page.className = 'page';
    page.innerHTML = `<div class="empty">请先在「项目列表」中选择或新建一个项目</div>`;
    return;
  }

  if (hash.startsWith('#/editor')) cleanup = renderEditorPage(page, cur!) ?? null;
  else if (hash.startsWith('#/materials')) cleanup = renderMaterialsPage(page, cur!) ?? null;
  else if (hash.startsWith('#/preview')) cleanup = renderPreviewPage(page, cur!) ?? null;
  else if (hash.startsWith('#/settings')) cleanup = renderSettingsPage(page) ?? null;
  else cleanup = renderProjectsPage(page) ?? null;
}

window.addEventListener('hashchange', route);
route();
