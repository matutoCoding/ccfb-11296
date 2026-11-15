// ---------- 本地存储:项目 CRUD / 复制 / 导入导出 / 全局设置 ----------

import {
  AppSettings,
  Project,
  defaultEnv,
  uid,
} from './types';

const PROJECTS_KEY = 'sg.projects.v1';
const SETTINGS_KEY = 'sg.settings.v1';
const CURRENT_KEY = 'sg.currentProject.v1';

export function defaultSettings(): AppSettings {
  return {
    defaultEnv: defaultEnv(),
    patternPPM: 512,
    normalMapSize: 512,
    refractStrength: 0.012,
    causticGain: 1.2,
    sunSoftness: 0.006,
    leadColor: '#2b2b2e',
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const s = JSON.parse(raw) as AppSettings;
    return { ...defaultSettings(), ...s, defaultEnv: { ...defaultEnv(), ...s.defaultEnv } };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

export function saveProjects(list: Project[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

export function getProject(id: string): Project | undefined {
  return loadProjects().find((p) => p.id === id);
}

export function upsertProject(p: Project): void {
  const list = loadProjects();
  const i = list.findIndex((x) => x.id === p.id);
  p.updatedAt = Date.now();
  if (i >= 0) list[i] = p;
  else list.push(p);
  saveProjects(list);
}

export function deleteProject(id: string): void {
  saveProjects(loadProjects().filter((p) => p.id !== id));
  if (getCurrentProjectId() === id) setCurrentProjectId(null);
}

export function duplicateProject(id: string): Project | undefined {
  const src = getProject(id);
  if (!src) return undefined;
  const copy: Project = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + ' 副本';
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  upsertProject(copy);
  return copy;
}

export function exportProject(p: Project): string {
  return JSON.stringify({ app: 'stained-glass-preview', version: 1, project: p }, null, 2);
}

/** 解析导入的 JSON,失败时抛出中文错误 */
export function parseProjectImport(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  const obj = data as Record<string, unknown>;
  const p = (obj && typeof obj === 'object' && 'project' in obj ? obj.project : obj) as Project;
  if (!p || typeof p !== 'object' || !p.pattern || !Array.isArray(p.pattern.pieces) || !p.env) {
    throw new Error('文件内容不是有效的项目数据');
  }
  // 重新分配 id,避免与现有项目冲突
  p.id = uid();
  p.name = (p.name || '导入项目') + '';
  p.updatedAt = Date.now();
  if (!p.createdAt) p.createdAt = Date.now();
  return p;
}

export function getCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentProjectId(id: string | null): void {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
}
