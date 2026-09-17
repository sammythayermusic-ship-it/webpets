// Tiny DOM helpers shared by the ui components. Nothing here is exported from src/ui/index.ts.

import type { Rect } from '../sim/types';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

/**
 * Interactive overlays must never let mousedown reach the canvas, where main.ts starts a native window drag,
 * and must not let contextmenu bubble to #app where main.ts pops the tray menu.
 */
export function stopDrag(node: HTMLElement): void {
  node.addEventListener('mousedown', (e) => e.stopPropagation());
  node.addEventListener('pointerdown', (e) => e.stopPropagation());
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

/** Element rect in window-local CSS px (relative to `root`, which is `#ui` at inset 0 of `#app`). Integers. */
export function relRect(node: HTMLElement, root: HTMLElement): Rect {
  const r = node.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  return {
    x: Math.round(r.left - base.left),
    y: Math.round(r.top - base.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

/** Window-local size of the overlay root (equals the Tauri window / mock #app size). */
export function rootSize(root: HTMLElement): { w: number; h: number } {
  const w = root.clientWidth || window.innerWidth;
  const h = root.clientHeight || window.innerHeight;
  return { w, h };
}

/** Center `node` (already sized by its content) on a rect, clamped inside the root. Integer px. */
export function centerIn(node: HTMLElement, target: Rect, root: HTMLElement): void {
  const size = rootSize(root);
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let x = Math.round(target.x + target.w / 2 - w / 2);
  let y = Math.round(target.y + target.h / 2 - h / 2);
  x = Math.max(0, Math.min(size.w - w, x));
  y = Math.max(0, Math.min(size.h - h, y));
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function pickRandom(list: readonly string[], rng: () => number = Math.random): string | null {
  if (list.length === 0) return null;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  return list[i] ?? null;
}
