// A timer that the browser will not throttle.
//
// The packaged app's document reports `visibilityState === 'hidden'` while the window is plainly on
// screen — it is never activated, because a desktop pet must not steal focus, and WebKit treats an
// unactivated window as not visible. For a hidden document WebKit stops `requestAnimationFrame`
// entirely and clamps `setTimeout`/`setInterval` to once per second. Measured in a real build: one
// scene advance per second, each carrying a full second of simulation. That is the stutter.
//
// A Worker has no visibility state, so its timers are not clamped. It does nothing but post an empty
// message on an interval; all the work stays on the main thread, which is demonstrably still
// processing tasks — the throttled timer proves that much.
//
// It falls back to a plain interval if the worker cannot be created or never reports, because this
// codebase has been bitten by workers before: Pixi's texture loader ran in a blob worker whose `fetch`
// could not reach `tauri://`, and every texture failed silently. This worker fetches nothing, so that
// failure does not apply — but a fallback that degrades to the old behaviour is cheap insurance
// against being wrong about that twice.

export interface Pacer {
  /** Which mechanism is actually running, for diagnostics. */
  readonly kind: () => 'worker' | 'timer';
  stop(): void;
}

/** The worker's entire program. */
const WORKER_SOURCE = `let h = null;
self.onmessage = (e) => {
  if (h !== null) { clearInterval(h); h = null; }
  const ms = e.data;
  if (ms > 0) h = setInterval(() => self.postMessage(0), ms);
};`;

/** If the worker has not reported within this long, assume it never will and use a plain timer. */
const WORKER_PROBE_MS = 2000;

export function createPacer(intervalMs: number, onTick: () => void): Pacer {
  const ms = Math.max(1, Math.round(intervalMs));
  let mode: 'worker' | 'timer' = 'timer';
  let worker: Worker | null = null;
  let url: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const startTimer = (): void => {
    if (stopped || timer !== null) return;
    timer = setInterval(onTick, ms);
  };

  const stopTimer = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  try {
    url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const w = new Worker(url);
    worker = w;
    w.onmessage = () => {
      if (stopped) return;
      if (mode !== 'worker') {
        // First report: the worker is alive, so the fallback is no longer needed.
        mode = 'worker';
        stopTimer();
      }
      onTick();
    };
    w.onerror = () => {
      mode = 'timer';
      startTimer();
    };
    w.postMessage(ms);
    // Run the plain timer alongside until the worker proves itself, so a worker that never starts
    // cannot leave the scene with no clock at all. `stopTimer` above retires it on the first message.
    startTimer();
    setTimeout(() => {
      if (!stopped && mode !== 'worker') startTimer();
    }, WORKER_PROBE_MS);
  } catch {
    worker = null;
    startTimer();
  }

  return {
    kind: () => mode,
    stop() {
      stopped = true;
      stopTimer();
      if (worker) {
        worker.onmessage = null;
        worker.postMessage(0);
        worker.terminate();
        worker = null;
      }
      if (url) {
        URL.revokeObjectURL(url);
        url = null;
      }
    },
  };
}
