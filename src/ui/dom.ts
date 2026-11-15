// ---------- 小型 DOM 构建工具 ----------

export function el(
  tag: string,
  attrs: Record<string, string | number | boolean | EventListener> = {},
  children: (Node | string)[] = [],
): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'className') {
      e.className = String(v);
    } else if (typeof v === 'boolean') {
      if (v) e.setAttribute(k, '');
    } else {
      e.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { className: 'field' }, [el('span', {}, [label]), input]);
}

export function numberInput(
  value: number,
  opts: { min?: number; max?: number; step?: number; onChange: (v: number) => void },
): HTMLInputElement {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = String(value);
  if (opts.min !== undefined) inp.min = String(opts.min);
  if (opts.max !== undefined) inp.max = String(opts.max);
  if (opts.step !== undefined) inp.step = String(opts.step);
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) opts.onChange(v);
    else inp.value = String(value);
  });
  return inp;
}

export function selectInput<T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    sel.append(opt);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value as T));
  return sel;
}

export function formatMinutes(m: number): string {
  const hh = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
