// Browser mock of the Tauri boundary for `npm run dev` in a normal browser and for Playwright.
// Same `Platform` interface, no Tauri: localStorage persistence, `#app` as the "window", a fixed
// `#mock-tray` canvas as the tray chip, a DOM popup menu, and `pointer` derived from DOM mouse events.
// Test hooks live on `window.__webpetsMock` (typed in ./mock.d.ts).

import { SCALE_L, SCALE_M, SCALE_S, type Scale, type TrayChipSize } from '../sim/constants';
import { pointerInside, windowSizeForScale } from './geometry';
import type { WebpetsMock } from './mock';
import type {
  ClockReading,
  PersistApi,
  Platform,
  PointerState,
  Rect,
  TrayAction,
  TrayMenuState,
  WindowGeometry,
} from './types';

const STORAGE_PREFIX = 'webpets:';
const APP_ID = 'app';
const TRAY_ID = 'mock-tray';
const MENU_ID = 'mock-menu';
const TRAY_CSS_PX = 22;

const MENU_ITEMS: ReadonlyArray<{ action: TrayAction; label: string }> = [
  { action: 'feed', label: 'Feed' },
  { action: 'pantry', label: 'Holiday feeder…' },
  { action: 'size-s', label: 'Size: Small' },
  { action: 'size-m', label: 'Size: Medium' },
  { action: 'size-l', label: 'Size: Large' },
  { action: 'mute', label: 'Mute' },
  { action: 'notifications', label: 'Notifications' },
  { action: 'daynight-auto', label: 'Day/Night: Auto' },
  { action: 'daynight-day', label: 'Day/Night: Day' },
  { action: 'daynight-night', label: 'Day/Night: Night' },
  { action: 'always-on-top', label: 'Visible on: Float above windows' },
  { action: 'all-desktops', label: 'Visible on: Every desktop' },
  { action: 'over-fullscreen', label: 'Visible on: Over fullscreen apps' },
  { action: 'launch-at-login', label: 'Launch at login' },
  { action: 'dev-panel', label: 'Dev panel' },
  { action: 'new-pet', label: 'New pet' },
  { action: 'toggle-visibility', label: 'Minimize' },
  { action: 'quit', label: 'Quit' },
];

type Listener<T> = (value: T) => void;

class Signal<T> {
  private readonly listeners = new Set<Listener<T>>();
  on(cb: Listener<T>): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  emit(value: T): void {
    for (const cb of Array.from(this.listeners)) cb(value);
  }
}

/** localStorage with an in-memory fallback for private windows / blocked storage. */
class MockStorage {
  private readonly memory = new Map<string, string>();

  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      /* storage blocked: fall through to memory */
    }
    return this.memory.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked: memory copy is the record */
    }
  }

  clearPrefix(prefix: string): void {
    for (const key of Array.from(this.memory.keys())) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key !== null && key.startsWith(prefix)) doomed.push(key);
      }
      for (const key of doomed) localStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
  }
}

function createStore(storage: MockStorage): PersistApi {
  return {
    load<T>(file: string): Promise<T | null> {
      const raw = storage.get(STORAGE_PREFIX + file);
      if (raw === null) return Promise.resolve(null);
      try {
        return Promise.resolve(JSON.parse(raw) as T);
      } catch (err: unknown) {
        console.warn(`[platform] corrupt ${STORAGE_PREFIX}${file}; treating as missing`, err);
        return Promise.resolve(null);
      }
    },
    set<T>(file: string, data: T): Promise<void> {
      storage.set(STORAGE_PREFIX + file, JSON.stringify(data));
      return Promise.resolve();
    },
    // localStorage writes are synchronous, so `set` already persisted; nothing to flush.
    save(): Promise<void> {
      return Promise.resolve();
    },
  };
}

function appElement(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(APP_ID);
}

function whenBodyReady(fn: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.body) fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

function createTrayChip(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = TRAY_ID;
  canvas.width = 18;
  canvas.height = 18;
  canvas.title = 'WebPets';
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    width: `${TRAY_CSS_PX}px`,
    height: `${TRAY_CSS_PX}px`,
    imageRendering: 'pixelated',
    cursor: 'pointer',
    zIndex: '10000',
    background: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>);
  canvas.hidden = true;
  return canvas;
}

export function createBrowserPlatform(): Platform {
  const storage = new MockStorage();
  const pointerSignal = new Signal<PointerState>();
  const movedSignal = new Signal<WindowGeometry>();
  const traySignal = new Signal<TrayAction>();
  const toggleSignal = new Signal<void>();
  const wakeSignal = new Signal<void>();

  let regions: Rect[] = [];
  let scale: Scale = 3;
  let hidden = false;
  let autostartOn = false;
  let pointerWasInside = false;
  let lastClient = { x: 8, y: 8 };
  let menuState: TrayMenuState | null = null;
  let menuEl: HTMLElement | null = null;
  const notifications: Array<{ title: string; body: string }> = [];

  const trayChip = createTrayChip();
  trayChip.addEventListener('click', () => toggleSignal.emit());
  whenBodyReady(() => document.body.appendChild(trayChip));

  const emitPointer = (inside: boolean, x: number, y: number): void => {
    const changed = inside !== pointerWasInside;
    pointerWasInside = inside;
    if (inside || changed) pointerSignal.emit({ inside, x, y });
  };

  const geometry = (): WindowGeometry => {
    const el = appElement();
    const rect = el?.getBoundingClientRect();
    const size = windowSizeForScale(scale);
    return {
      x: Math.round(rect?.left ?? 0),
      y: Math.round(rect?.top ?? 0),
      width: size.width,
      height: size.height,
      scaleFactor: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      monitorKey:
        typeof window === 'undefined' ? 'browser@0x0' : `browser@${window.innerWidth}x${window.innerHeight}`,
    };
  };

  const wirePointer = (): void => {
    const el = appElement();
    if (!el) return;
    el.addEventListener('mousemove', (e: MouseEvent) => {
      lastClient = { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      emitPointer(pointerInside(regions, x, y), x, y);
    });
    el.addEventListener('mouseleave', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      emitPointer(false, Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top));
    });
  };
  whenBodyReady(wirePointer);

  const closeMenu = (): void => {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  };

  const isChecked = (action: TrayAction): boolean => {
    const s = menuState;
    if (!s) return false;
    switch (action) {
      case 'size-s':
        return s.scale === SCALE_S;
      case 'size-m':
        return s.scale === SCALE_M;
      case 'size-l':
        return s.scale === SCALE_L;
      case 'mute':
        return s.muted;
      case 'notifications':
        return !s.notificationsMuted;
      case 'daynight-auto':
        return s.dayNight === 'auto';
      case 'daynight-day':
        return s.dayNight === 'day';
      case 'daynight-night':
        return s.dayNight === 'night';
      case 'launch-at-login':
        return s.launchAtLogin;
      case 'always-on-top':
        return s.alwaysOnTop;
      case 'all-desktops':
        return s.allDesktops;
      case 'over-fullscreen':
        return s.overFullscreen;
      default:
        return false;
    }
  };

  const openMenu = (): void => {
    closeMenu();
    if (typeof document === 'undefined' || !document.body) return;
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${Math.max(0, lastClient.x)}px`,
      top: `${Math.max(0, lastClient.y)}px`,
      display: 'flex',
      flexDirection: 'column',
      minWidth: '160px',
      padding: '4px 0',
      background: '#fff',
      color: '#000',
      border: '1px solid #000',
      boxShadow: '3px 3px 0 #000',
      font: '12px system-ui, sans-serif',
      zIndex: '10001',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const item of MENU_ITEMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.dataset['action'] = item.action;
      const label =
        item.action === 'toggle-visibility' ? (hidden ? 'Show' : 'Minimize') : item.label;
      button.textContent = `${isChecked(item.action) ? '✓ ' : ''}${label}`;
      button.disabled =
        (item.action === 'feed' || item.action === 'pantry') && menuState !== null && !menuState.alive;
      Object.assign(button.style, {
        textAlign: 'left',
        padding: '4px 12px',
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        cursor: button.disabled ? 'default' : 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      button.addEventListener('mousedown', (e) => e.stopPropagation());
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        traySignal.emit(item.action);
      });
      menu.appendChild(button);
    }
    menu.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(menu);
    menuEl = menu;
    const onOutside = (e: Event): void => {
      if (menuEl && e.target instanceof Node && !menuEl.contains(e.target)) closeMenu();
      if (!menuEl) document.removeEventListener('mousedown', onOutside, true);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu();
      if (!menuEl) document.removeEventListener('keydown', onKey, true);
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  };

  const setHidden = (value: boolean): void => {
    hidden = value;
    const el = appElement();
    if (el) el.hidden = value;
    trayChip.hidden = !value;
    if (value) emitPointer(false, 0, 0);
  };

  const platform: Platform = {
    kind: 'browser',
    // There is no bundle and no executable in a browser, and saying so is more useful than a plausible
    // fake: the whole point of this field is to be trusted when it names a path.
    buildIdentity: () =>
      Promise.resolve({
        bundle: '(browser)',
        exe: location.href,
        version: 'dev',
        builtAtMs: null,
        staleLaunch: null,
      }),
    clock: (): Promise<ClockReading> => {
      const now = Date.now();
      return Promise.resolve({ wallMs: now, monoMs: now });
    },
    store: createStore(storage),
    window: {
      setScale: (s: Scale): Promise<WindowGeometry> => {
        scale = s;
        const el = appElement();
        const size = windowSizeForScale(s);
        if (el) {
          el.style.width = `${size.width}px`;
          el.style.height = `${size.height}px`;
        }
        const g = geometry();
        movedSignal.emit(g);
        return Promise.resolve(g);
      },
      startDrag: () => Promise.resolve(),
      setHitRegions: (next: Rect[]): Promise<void> => {
        regions = next.map((r) => ({ ...r }));
        return Promise.resolve();
      },
      onPointer: (cb) => pointerSignal.on(cb),
      getGeometry: () => Promise.resolve(geometry()),
      hide: (): Promise<void> => {
        setHidden(true);
        return Promise.resolve();
      },
      show: (): Promise<void> => {
        setHidden(false);
        return Promise.resolve();
      },
      isVisible: () => Promise.resolve(!hidden),
      popupMenu: (): Promise<void> => {
        openMenu();
        return Promise.resolve();
      },
      onMoved: (cb) => movedSignal.on(cb),
      // The mock has one window, no window manager and no click-through, so a live resize is just a
      // resize and there is no pointer to hand anywhere.
      setScaleLive: (s: Scale): Promise<WindowGeometry> => platform.window.setScale(s),
      setInteractionLock: async () => undefined,
      getLayering: async () => ({ level: 0, behavior: 0 }),
      setLayering: async () => undefined,
    },
    tray: {
      setChip: (rgba: Uint8Array, size: TrayChipSize): Promise<void> => {
        if (rgba.length !== size * size * 4) {
          return Promise.reject(
            new RangeError(`tray chip rgba length ${rgba.length} does not match ${size}x${size}x4`),
          );
        }
        trayChip.width = size;
        trayChip.height = size;
        const ctx = trayChip.getContext('2d');
        if (ctx) {
          const image = ctx.createImageData(size, size);
          image.data.set(rgba);
          ctx.putImageData(image, 0, 0);
        }
        return Promise.resolve();
      },
      setTooltip: (text: string): Promise<void> => {
        trayChip.title = text;
        return Promise.resolve();
      },
      setMenuState: (state: TrayMenuState): Promise<void> => {
        menuState = { ...state };
        return Promise.resolve();
      },
      onAction: (cb) => traySignal.on(cb),
    },
    notify: (title: string, body: string): Promise<void> => {
      notifications.push({ title, body });
      console.info(`[notify] ${title} — ${body}`);
      return Promise.resolve();
    },
    autostart: {
      isEnabled: () => Promise.resolve(autostartOn),
      setEnabled: (on: boolean): Promise<void> => {
        autostartOn = on;
        return Promise.resolve();
      },
    },
    onToggleVisibility: (cb) => toggleSignal.on(() => cb()),
    onWake: (cb) => wakeSignal.on(() => cb()),
    quit: (): Promise<void> => {
      console.info('[platform] quit requested (browser mock: no-op)');
      return Promise.resolve();
    },
  };

  const mock: WebpetsMock = {
    emitTray: (action) => traySignal.emit(action),
    emitWake: () => wakeSignal.emit(),
    emitToggleVisibility: () => toggleSignal.emit(),
    emitPointer: (inside, x, y) => emitPointer(inside, x, y),
    notifications,
    geometry,
    reset: () => {
      storage.clearPrefix(STORAGE_PREFIX);
      notifications.length = 0;
    },
    trayChip,
  };
  if (typeof window !== 'undefined') window.__webpetsMock = mock;

  return platform;
}
