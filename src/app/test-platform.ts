// In-memory Platform for unit tests (src/app/*.test.ts). Not shipped.
import type { Platform, PointerState, TrayAction, TrayMenuState, WindowGeometry } from '../platform/types';
import type { Scale, TrayChipSize } from '../sim/constants';

export interface FakePlatform extends Platform {
  files: Map<string, unknown>;
  saveCount: number;
  notifications: Array<{ title: string; body: string }>;
  scaleCalls: Scale[];
  visible: boolean;
  quitCalled: boolean;
  autostartEnabled: boolean;
  emitWake(): void;
  emitToggleVisibility(): void;
}

export function createFakePlatform(seedFiles: Record<string, unknown> = {}): FakePlatform {
  const files = new Map<string, unknown>(Object.entries(seedFiles));
  const wakeListeners = new Set<() => void>();
  const toggleListeners = new Set<() => void>();
  const geometry = (): WindowGeometry => ({
    x: 0,
    y: 0,
    width: 528,
    height: 408,
    scaleFactor: 2,
    monitorKey: 'fake@1440x900',
  });
  const p: FakePlatform = {
    kind: 'browser',
    files,
    saveCount: 0,
    notifications: [],
    scaleCalls: [],
    visible: false,
    quitCalled: false,
    autostartEnabled: false,
    emitWake: () => wakeListeners.forEach((cb) => cb()),
    emitToggleVisibility: () => toggleListeners.forEach((cb) => cb()),
    clock: async () => ({ wallMs: Date.now(), monoMs: Date.now() }),
    store: {
      load: async <T>(file: string): Promise<T | null> => {
        const v = files.get(file);
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
      },
      save: async <T>(file: string, data: T): Promise<void> => {
        p.saveCount += 1;
        files.set(file, JSON.parse(JSON.stringify(data)));
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
    },
    tray: {
      setChip: async (_rgba: Uint8Array, _size: TrayChipSize) => undefined,
      setTooltip: async () => undefined,
      setMenuState: async (_s: TrayMenuState) => undefined,
      onAction: (_cb: (a: TrayAction) => void) => () => undefined,
    },
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
