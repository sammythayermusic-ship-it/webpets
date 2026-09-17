// Ticks the store: on start, every 30 s, on visibilitychange (to visible), on window focus, and on platform wake.
import type { Platform } from '../platform/types';
import type { AppStore } from './types';

export const TICK_INTERVAL_MS = 30_000;

export function startScheduler(store: AppStore, platform: Platform, intervalMs: number = TICK_INTERVAL_MS): () => void {
  const tick = (): void => {
    try {
      store.getState().actions.tick();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    }
  };
  tick();
  const interval = setInterval(tick, intervalMs);

  const doc: Document | null = typeof document !== 'undefined' ? document : null;
  const win: Window | null = typeof window !== 'undefined' ? window : null;
  const onVisibility = (): void => {
    if (doc === null || doc.visibilityState === 'visible') tick();
  };
  const onFocus = (): void => tick();
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('focus', onFocus);
  const offWake = platform.onWake(tick);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('focus', onFocus);
    offWake();
  };
}
