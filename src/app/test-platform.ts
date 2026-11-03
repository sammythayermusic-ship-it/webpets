// In-memory Platform for unit tests (src/app/*.test.ts). Not shipped.
import type { Layering, Platform, PointerState, TrayAction, TrayMenuState, WindowGeometry } from '../platform/types';
import { DEFAULT_SCALE, windowSizeForScale, type Scale, type TrayChipSize } from '../sim/constants';

export interface FakePlatform extends Platform {
  /** On-disk contents: updated only by `store.save`. */
  files: Map<string, unknown>;
  /** The store plugin's in-memory documents: updated by `store.set`, read by `store.load`. */
  cache: Map<string, unknown>;
  setCount: number;
  saveCount: number;
  notifications: Array<{ title: string; body: string }>;
  scaleCalls: Scale[];
  layeringCalls: Layering[];
  interactionLockCalls: number[];
  visible: boolean;
  quitCalled: boolean;
  autostartEnabled: boolean;
  emitWake(): void;
  emitToggleVisibility(): void;
}

export function createFakePlatform(seedFiles: Record<string, unknown> = {}): FakePlatform {
  const files = new Map<string, unknown>(Object.entries(seedFiles));
  const cache = new Map<string, unknown>(files);
  const wakeListeners = new Set<() => void>();
  const toggleListeners = new Set<() => void>();
  const geometry = (): WindowGeometry => ({
    x: 0,
    y: 0,
    ...windowSizeForScale(DEFAULT_SCALE),
    scaleFactor: 2,
    monitorKey: 'fake@1440x900',
  });
  const p: FakePlatform = {
    kind: 'browser',
    buildIdentity: () =>
      Promise.resolve({
        bundle: '(test)',
        exe: '(test)',
        version: '0.0.0-test',
        builtAtMs: null,
        staleLaunch: null,
      }),
    files,
    cache,
    setCount: 0,
    saveCount: 0,
    notifications: [],
    scaleCalls: [],
    layeringCalls: [],
    interactionLockCalls: [],
    visible: false,
    quitCalled: false,
    autostartEnabled: false,
    emitWake: () => wakeListeners.forEach((cb) => cb()),
    emitToggleVisibility: () => toggleListeners.forEach((cb) => cb()),
    clock: async () => ({ wallMs: Date.now(), monoMs: Date.now() }),
    store: {
      load: async <T>(file: string): Promise<T | null> => {
        const v = cache.get(file);
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
      },
      set: async <T>(file: string, data: T): Promise<void> => {
        p.setCount += 1;
        cache.set(file, JSON.parse(JSON.stringify(data)));
      },
      save: async (file: string): Promise<void> => {
        p.saveCount += 1;
        const v = cache.get(file);
        if (v === undefined) files.delete(file);
        else files.set(file, JSON.parse(JSON.stringify(v)));
      },
    },
    window: {
      setScale: async (scale: Scale) => {
        p.scaleCalls.push(scale);
        return geometry();
      },
      startDrag: async () => undefined,
      setHitRegions: async () => undefined,
      onPointer: (_cb: (s: PointerState) => void) => () => undefined,
      getGeometry: async () => geometry(),
      hide: async () => {
        p.visible = false;
      },
      show: async () => {
        p.visible = true;
      },
      isVisible: async () => p.visible,
      popupMenu: async () => undefined,
      onMoved: () => () => undefined,
      setScaleLive: async (scale) => {
        p.scaleCalls.push(scale);
        return geometry();
      },
      setInteractionLock: async (ms) => {
        p.interactionLockCalls.push(ms);
      },
      getLayering: async () => ({ level: 0, behavior: 0 }),
      setLayering: async (opts) => {
        p.layeringCalls.push({ ...opts });
      },
    },
    tray: {
      setChip: async (_rgba: Uint8Array, _size: TrayChipSize) => undefined,
      setTooltip: async () => undefined,
      setMenuState: async (_s: TrayMenuState) => undefined,
      onAction: (_cb: (a: TrayAction) => void) => () => undefined,
    },
    voice: {
      status: async () => ({ hasKey: false }),
      write: async () => ({ text: null, usd: 0 }),
    },
    inputIdle: async () => ({ keys: Number.MAX_VALUE, any: 0, fullscreen: false }),
    openLink: async () => {},
    notify: async (title, body) => {
      p.notifications.push({ title, body });
    },
    autostart: {
      isEnabled: async () => p.autostartEnabled,
      setEnabled: async (on) => {
        p.autostartEnabled = on;
      },
    },
    onToggleVisibility: (cb) => {
      toggleListeners.add(cb);
      return () => toggleListeners.delete(cb);
    },
    onWake: (cb) => {
      wakeListeners.add(cb);
      return () => wakeListeners.delete(cb);
    },
    quit: async () => {
      p.quitCalled = true;
    },
  };
  return p;
}
