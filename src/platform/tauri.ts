// Real platform: thin wrappers over the Rust commands and events in docs/ARCHITECTURE.md
// ("Tauri commands and events"). Rust owns geometry, tray, notifications, autostart and the clock;
// only window dragging and the store plugin are called through the JS APIs directly.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load, type Store } from '@tauri-apps/plugin-store';
import type { Scale, TrayChipSize } from '../sim/constants';
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

/** Every key the whole document is stored under; Rust only touches the separate `positions` key. */
const DOC_KEY = 'doc';

const TRAY_ACTIONS: ReadonlySet<string> = new Set<TrayAction>([
  'feed',
  'pantry',
  'size-s',
  'size-m',
  'size-l',
  'mute',
  'notifications',
  'daynight-auto',
  'daynight-day',
  'daynight-night',
  'launch-at-login',
  'dev-panel',
  'new-pet',
  'toggle-visibility',
  'quit',
]);

function isTrayAction(id: unknown): id is TrayAction {
  return typeof id === 'string' && TRAY_ACTIONS.has(id);
}

/**
 * Subscribes to a Rust event and returns a synchronous unsubscribe. `listen` resolves asynchronously,
 * so an unsubscribe issued before it resolves is honored once the listener registers.
 */
function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;
  listen<T>(event, (e) => {
    if (!disposed) cb(e.payload);
  })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch((err: unknown) => {
      console.error(`[platform] listen(${event}) failed`, err);
    });
  return () => {
    disposed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}

function createStore(): PersistApi {
  const stores = new Map<string, Promise<Store>>();
  const storeFor = (file: string): Promise<Store> => {
    let p = stores.get(file);
    if (!p) {
      // Explicit saves only: `save()` is called right after every `set('doc')`; the plugin also saves
      // every loaded store on exit, and Rust saves after writing `positions`.
      p = load(file, { autoSave: false });
      stores.set(file, p);
    }
    return p;
  };
  return {
    async load<T>(file: string): Promise<T | null> {
      const store = await storeFor(file);
      const doc = await store.get<T>(DOC_KEY);
      return doc === undefined ? null : doc;
    },
    async save<T>(file: string, data: T): Promise<void> {
      const store = await storeFor(file);
      await store.set(DOC_KEY, data);
      await store.save();
    },
  };
}

export function createTauriPlatform(): Platform {
  return {
    kind: 'tauri',
    clock: () => invoke<ClockReading>('clock_now'),
    store: createStore(),
    window: {
      setScale: (scale: Scale) => invoke<WindowGeometry>('set_scale', { scale }),
      startDrag: () => getCurrentWindow().startDragging(),
      setHitRegions: (regions: Rect[]) => invoke<void>('set_hit_regions', { regions }),
      onPointer: (cb) => subscribe<PointerState>('pointer', cb),
      getGeometry: () => invoke<WindowGeometry>('get_geometry'),
      hide: () => invoke<void>('hide_window'),
      show: () => invoke<void>('show_window'),
      isVisible: () => getCurrentWindow().isVisible(),
      popupMenu: () => invoke<void>('popup_menu'),
      onMoved: (cb) => subscribe<WindowGeometry>('window-moved', cb),
    },
    tray: {
      setChip: (rgba: Uint8Array, size: TrayChipSize) =>
        invoke<void>('tray_set_chip', { rgba: Array.from(rgba), size }),
      setTooltip: (text: string) => invoke<void>('tray_set_tooltip', { text }),
      // The state object itself is the args object; Rust reads each field by its camelCase name.
      setMenuState: (state: TrayMenuState) => invoke<void>('tray_set_menu_state', { ...state }),
      onAction: (cb) =>
        subscribe<unknown>('tray-action', (id) => {
          if (isTrayAction(id)) cb(id);
          else console.warn('[platform] unknown tray action', id);
        }),
    },
    notify: (title: string, body: string) => invoke<void>('notify', { title, body }),
    autostart: {
      isEnabled: () => invoke<boolean>('autostart_get'),
      setEnabled: (on: boolean) => invoke<void>('autostart_set', { on }),
    },
    onToggleVisibility: (cb) => subscribe<null>('toggle-visibility', () => cb()),
    onWake: (cb) => subscribe<null>('wake', () => cb()),
    quit: () => invoke<void>('quit_app'),
  };
}
