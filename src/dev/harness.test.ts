import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { dataUrlToBytes, drainInbox, isDetached, parseCommand, runCommand, startPoller } from './harness';
import type { HarnessContext, HarnessIo, HarnessResult } from './harness';
import type { AppActions, AppState, DevActions } from '../app/types';
import { defaultSettings } from '../app/persistence';
import { fresh } from '../sim/test-helpers';
import { defaultNeeds } from '../sim/needs';
import { B } from '../sim/test-helpers';
import type { HabitatScene } from '../render/types';
import type { WindowGeometry } from '../platform/types';
import type { FeedResult } from '../sim/types';

type DebugState = ReturnType<HabitatScene['debugState']>;

function fakeDev(): DevActions {
  return {
    skip: vi.fn(),
    skipOnNextLaunch: vi.fn(async () => undefined),
    setHunger: vi.fn(),
    setPantry: vi.fn(),
    setBalance: vi.fn(),
    forceState: vi.fn(),
    simulateAbsence: vi.fn(() => []),
    resetClock: vi.fn(),
    setNightOverride: vi.fn(),
    setNeeds: vi.fn(),
    setSpecies: vi.fn(async () => undefined),
  };
}

function fakeActions(): AppActions {
  return {
    boot: vi.fn(async () => undefined),
    tick: vi.fn(),
    now: vi.fn(() => Date.now()),
    feed: vi.fn((): FeedResult => ({ ok: true, state: fresh(), events: [] })),
    depositPantry: vi.fn(),
    withdrawPantry: vi.fn(),
    newPet: vi.fn(),
    acknowledgeDeath: vi.fn(),
    addSpeciesData: vi.fn(),
    setScale: vi.fn(async () => undefined),
    setMuted: vi.fn(),
    setNotificationsMuted: vi.fn(),
    setDayNight: vi.fn(),
    setLaunchAtLogin: vi.fn(async () => undefined),
    setLayering: vi.fn(async () => undefined),
    setHidden: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    poke: vi.fn(),
    setPresence: vi.fn(),
    drives: vi.fn(() => ({ activity: 0, approach: 0, hide: 0, nap: false, greet: false, surface: 0 })),
    dev: fakeDev(),
  };
}

function fakeState(actions: AppActions): AppState {
  return {
    hydrated: true,
    pet: fresh(),
    balance: 1000,
    settings: defaultSettings(),
    latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
    hidden: false,
    recentEvents: [],
    lastFeedEvent: null,
    hunger: 100,
    night: false,
    daylight: { dawn: 0, day: 1, dusk: 0, night: 0 },
    nightOverride: null,
    needs: defaultNeeds(B),
    present: false,
    actions,
  };
}

function debugState(over: Partial<DebugState> = {}): DebugState {
  return {
    petVisible: true,
    petAnim: 'idle',
    petPos: { x: 160, y: 120 },
    drawnPos: { x: 160.5, y: 120 },
    petFrame: { w: 80, h: 80 },
    advances: 0,
    lastDtMs: 16,
    pacer: 'worker',
    renderMs: 1.5,
    steps: 0,
    stepSkips: 0,
    hasView: true,
    layerAlpha: {},
    ...over,
  };
}

const geometry: WindowGeometry = { x: 10, y: 20, width: 288, height: 228, scaleFactor: 2, monitorKey: 'fake@1440x900' };

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

interface Harness {
  ctx: HarnessContext;
  io: HarnessIo;
  actions: AppActions;
  writes: Array<{ name: string; bytes: Uint8Array }>;
  emitted: HarnessResult[];
  sleeps: number[];
  setPointer: ReturnType<typeof vi.fn>;
}

function makeHarness(): Harness {
  const actions = fakeActions();
  const store = createStore<AppState>(() => fakeState(actions));
  const writes: Array<{ name: string; bytes: Uint8Array }> = [];
  const emitted: HarnessResult[] = [];
  const sleeps: number[] = [];
  const setPointer = vi.fn();
  let clock = 1_700_000_000_000;
  const ctx: HarnessContext = {
    store,
    platform: { window: { getGeometry: async () => geometry } },
    scene: {
      snapshot: async () => PNG_DATA_URL,
      debugState: () => debugState(),
      fps: () => 60,
      setPointer,
    },
    devPanel: { toggle: vi.fn(), isOpen: () => false, getRect: () => null },
  };
  const io: HarnessIo = {
    write: async (name, bytes) => {
      writes.push({ name, bytes });
      return `/fake/out/${name}`;
    },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    emit: async (r) => {
      emitted.push(r);
    },
  };
  return { ctx, io, actions, writes, emitted, sleeps, setPointer };
}

describe('harness runCommand', () => {
  it('state returns the documented shape', async () => {
    const h = makeHarness();
    const r = await runCommand({ id: 'a', op: 'state' }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(r.id).toBe('a');
    expect(r.op).toBe('state');
    expect(r.at).toBe(new Date(h.io.now()).toISOString());
    const data = r.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(
      ['balance', 'drives', 'fps', 'geometry', 'hasFocus', 'hidden', 'hunger', 'needs', 'night', 'pet', 'present', 'scene', 'settings', 'visibility'].sort(),
    );
    expect(data['visibility']).toBe('no-document'); // vitest runs in node here
    expect(data['fps']).toBe(60);
    expect(data['geometry']).toEqual(geometry);
    expect(data['hunger']).toBe(100);
    expect(data['balance']).toBe(1000);
    expect((data['scene'] as DebugState).petAnim).toBe('idle');
  });

  it('poke validates the stimulus and forwards it; presence forwards the flag', async () => {
    const h = makeHarness();
    const bad = await runCommand({ op: 'poke', kind: 'kick' }, h.ctx, h.io);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/kind/);
    const ok = await runCommand({ op: 'poke', kind: 'tap' }, h.ctx, h.io);
    expect(ok.ok).toBe(true);
    expect(h.actions.poke).toHaveBeenCalledWith('tap');
    const p = await runCommand({ op: 'presence', present: true }, h.ctx, h.io);
    expect(p.ok).toBe(true);
    expect(h.actions.setPresence).toHaveBeenCalledWith(true);
    expect((await runCommand({ op: 'presence', present: 'yes' }, h.ctx, h.io)).ok).toBe(false);
  });

  it('setNeeds forwards only the numbers given', async () => {
    const h = makeHarness();
    const r = await runCommand({ op: 'setNeeds', energy: 0.1, stress: 0.9 }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(h.actions.dev.setNeeds).toHaveBeenCalledWith({ energy: 0.1, stress: 0.9 });
    expect((await runCommand({ op: 'setNeeds', energy: 'low' }, h.ctx, h.io)).ok).toBe(false);
  });

  it('feed calls the store action and returns its result', async () => {
    const h = makeHarness();
    const r = await runCommand({ op: 'feed' }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(h.actions.feed).toHaveBeenCalledTimes(1);
    expect((r.data as FeedResult).ok).toBe(true);
    expect(r.id).toBe(`${h.io.now()}-feed`); // generated when the command carries none
  });

  it('routes the simple dev ops to their actions', async () => {
    const h = makeHarness();
    await runCommand({ op: 'skip', ms: 3600_000 }, h.ctx, h.io);
    await runCommand({ op: 'setHunger', n: 20 }, h.ctx, h.io);
    await runCommand({ op: 'setPantry', n: 500 }, h.ctx, h.io);
    await runCommand({ op: 'setBalance', n: 42 }, h.ctx, h.io);
    await runCommand({ op: 'force', state: 'hungry' }, h.ctx, h.io);
    await runCommand({ op: 'night', value: true }, h.ctx, h.io);
    await runCommand({ op: 'night', value: null }, h.ctx, h.io);
    await runCommand({ op: 'scale', steps: 16 }, h.ctx, h.io);
    await runCommand({ op: 'hide' }, h.ctx, h.io);
    await runCommand({ op: 'show' }, h.ctx, h.io);
    await runCommand({ op: 'resetClock' }, h.ctx, h.io);
    await runCommand({ op: 'pointer', x: 100, y: 80 }, h.ctx, h.io);
    await runCommand({ op: 'pointer', x: null }, h.ctx, h.io);
    expect(h.actions.dev.skip).toHaveBeenCalledWith(3600_000);
    expect(h.actions.dev.setHunger).toHaveBeenCalledWith(20);
    expect(h.actions.dev.setPantry).toHaveBeenCalledWith(500);
    expect(h.actions.dev.setBalance).toHaveBeenCalledWith(42);
    expect(h.actions.dev.forceState).toHaveBeenCalledWith('hungry');
    expect(h.actions.dev.setNightOverride).toHaveBeenNthCalledWith(1, true);
    expect(h.actions.dev.setNightOverride).toHaveBeenNthCalledWith(2, null);
    expect(h.actions.setScale).toHaveBeenCalledWith(16);
    expect(h.actions.setHidden).toHaveBeenNthCalledWith(1, true);
    expect(h.actions.setHidden).toHaveBeenNthCalledWith(2, false);
    expect(h.actions.dev.resetClock).toHaveBeenCalledTimes(1);
    expect(h.setPointer).toHaveBeenNthCalledWith(1, 100, 80);
    expect(h.setPointer).toHaveBeenNthCalledWith(2, null, null);
  });

  it('rejects bad arguments by name without throwing', async () => {
    const h = makeHarness();
    const r1 = await runCommand({ op: 'skip', ms: 'soon' }, h.ctx, h.io);
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain('"ms"');
    const r2 = await runCommand({ op: 'force', state: 'confused' }, h.ctx, h.io);
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain('confused');
    const r3 = await runCommand({ op: 'night', value: 'yes' }, h.ctx, h.io);
    expect(r3.ok).toBe(false);
    expect(h.actions.dev.skip).not.toHaveBeenCalled();
    expect(h.actions.dev.forceState).not.toHaveBeenCalled();
  });

  it('unknown op -> ok:false with the op named', async () => {
    const h = makeHarness();
    const r = await runCommand({ id: 'x', op: 'dance' }, h.ctx, h.io);
    expect(r).toMatchObject({ id: 'x', op: 'dance', ok: false });
    expect(r.error).toContain('dance');
    expect(r.data).toBeUndefined();
  });

  it('devPanel uses open/close when present, else toggle', async () => {
    const h = makeHarness();
    let open = false;
    const toggle = vi.fn(() => {
      open = !open;
    });
    h.ctx.devPanel = { toggle, isOpen: () => open, getRect: () => null };
    const r1 = await runCommand({ op: 'devPanel', open: true }, h.ctx, h.io);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(r1.data).toEqual({ open: true, rect: null });
    await runCommand({ op: 'devPanel', open: true }, h.ctx, h.io); // already open: no-op
    expect(toggle).toHaveBeenCalledTimes(1);

    const openFn = vi.fn(() => {
      open = true;
    });
    const closeFn = vi.fn(() => {
      open = false;
    });
    h.ctx.devPanel = { toggle, isOpen: () => open, getRect: () => null, open: openFn, close: closeFn };
    await runCommand({ op: 'devPanel', open: false }, h.ctx, h.io);
    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('snapshot writes <name>.png with the decoded bytes', async () => {
    const h = makeHarness();
    const r = await runCommand({ op: 'snapshot', name: 'shot-1' }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]?.name).toBe('shot-1.png');
    expect(Array.from(h.writes[0]?.bytes ?? [])).toEqual(Array.from(PNG_BYTES));
    expect(r.data).toEqual({ file: '/fake/out/shot-1.png', bytes: PNG_BYTES.length });
  });

  it('dataUrlToBytes rejects anything that is not a base64 data URL', () => {
    expect(() => dataUrlToBytes('nope')).toThrow(/data URL/);
    expect(() => dataUrlToBytes('data:text/plain,hello')).toThrow(/base64/);
  });

  it('stats samples advances and steps across the sleep', async () => {
    const h = makeHarness();
    let advances = 0;
    let steps = 0;
    h.ctx.scene = {
      ...h.ctx.scene,
      debugState: () => {
        const snap = debugState({ advances, steps, renderMs: 2.25 });
        advances += 120;
        steps += 16;
        return snap;
      },
    };
    const r = await runCommand({ op: 'stats', seconds: 2 }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(h.sleeps).toEqual([2000]);
    expect(r.data).toEqual({ advancesPerSec: 60, stepsPerSec: 8, fps: 60, visibility: 'no-document', renderMs: 2.25, elapsedMs: 2000 });
  });

  it('script runs steps in order, sleeps, and emits one result per step', async () => {
    const h = makeHarness();
    const order: string[] = [];
    h.actions.feed = vi.fn((): FeedResult => {
      order.push('feed');
      return { ok: true, state: fresh(), events: [] };
    });
    h.actions.dev.forceState = vi.fn(() => {
      order.push('force');
    });
    const originalSleep = h.io.sleep;
    h.io.sleep = async (ms) => {
      order.push(`sleep:${ms}`);
      await originalSleep(ms);
    };
    const r = await runCommand(
      {
        id: 'scn',
        op: 'script',
        steps: [{ op: 'sleep', ms: 400 }, { op: 'feed' }, { op: 'sleep', ms: 800 }, { op: 'force', state: 'hungry' }],
      },
      h.ctx,
      h.io,
    );
    expect(order).toEqual(['sleep:400', 'feed', 'sleep:800', 'force']);
    expect(r.ok).toBe(true);
    expect(h.emitted.map((e) => e.id)).toEqual(['scn.0-sleep', 'scn.1-feed', 'scn.2-sleep', 'scn.3-force']);
    expect(h.emitted.every((e) => e.ok)).toBe(true);
    expect(r.data).toEqual({
      steps: [
        { id: 'scn.0-sleep', op: 'sleep', ok: true },
        { id: 'scn.1-feed', op: 'feed', ok: true },
        { id: 'scn.2-sleep', op: 'sleep', ok: true },
        { id: 'scn.3-force', op: 'force', ok: true },
      ],
    });
  });

  it('script keeps going past a failing step and reports the failure', async () => {
    const h = makeHarness();
    const r = await runCommand({ id: 's', op: 'script', steps: [{ op: 'dance' }, { op: 'feed' }] }, h.ctx, h.io);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('1 of 2');
    expect(h.actions.feed).toHaveBeenCalledTimes(1);
    expect(h.emitted.map((e) => e.ok)).toEqual([false, true]);
  });

  it('script does not wait for a record step', async () => {
    const h = makeHarness();
    // In node there is no MediaRecorder, so the detached step fails on its own; the script must still
    // have moved on to feed and finished without that failure counting against it.
    const r = await runCommand({ id: 's', op: 'script', steps: [{ op: 'record', name: 'clip', seconds: 20 }, { op: 'feed' }] }, h.ctx, h.io);
    expect(r.ok).toBe(true);
    expect(h.actions.feed).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const recordResult = h.emitted.find((e) => e.op === 'record');
    expect(recordResult?.ok).toBe(false);
    expect(recordResult?.error).toContain('MediaRecorder');
  });

  it('record falls back with a clear error when MediaRecorder is undefined', async () => {
    const h = makeHarness();
    expect(typeof MediaRecorder).toBe('undefined');
    expect(isDetached({ op: 'record' })).toBe(true);
    const r = await runCommand({ id: 'rec', op: 'record', name: 'clip', seconds: 20 }, h.ctx, h.io);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('MediaRecorder is not available');
    expect(h.writes).toHaveLength(0);
  });

  it('species is scheduled after the result so the reload cannot eat it', async () => {
    vi.useFakeTimers();
    try {
      const h = makeHarness();
      const r = await runCommand({ op: 'species', species: 'hamster', habitat: 'cage' }, h.ctx, h.io);
      expect(r.ok).toBe(true);
      expect(r.data).toEqual({ scheduled: true, reloads: true });
      expect(h.actions.dev.setSpecies).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(h.actions.dev.setSpecies).toHaveBeenCalledWith('hamster', 'cage');
      const bad = await runCommand({ op: 'species', species: 'dragon', habitat: 'cage' }, h.ctx, h.io);
      expect(bad.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('harness parseCommand', () => {
  it('keeps a well-formed command', () => {
    expect(parseCommand('{"id":"1","op":"feed"}')).toEqual({ id: '1', op: 'feed' });
  });

  it('turns bad input into an "invalid" command that still carries the id', () => {
    expect(parseCommand('{').op).toBe('invalid');
    const r = parseCommand('{"id":"k"}');
    expect(r.op).toBe('invalid');
    expect(r.id).toBe('k');
  });
});

describe('harness poller', () => {
  it('drainInbox isolates each command: a failing result write does not drop the rest of the batch', async () => {
    const h = makeHarness();
    const originalEmit = h.io.emit;
    let emits = 0;
    h.io.emit = async (r) => {
      emits++;
      if (emits === 1) throw new Error('disk full');
      await originalEmit(r);
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await drainInbox(['{"id":"a","op":"state"}', 'not json', '{"id":"c","op":"feed"}'], h.ctx, h.io);
      expect(warn).toHaveBeenCalledTimes(1); // the lost write for "a", nothing else
    } finally {
      warn.mockRestore();
    }
    expect(h.actions.feed).toHaveBeenCalledTimes(1);
    expect(h.emitted.map((e) => [e.id, e.op, e.ok])).toEqual([
      [`${h.io.now()}-invalid`, 'invalid', false],
      ['c', 'feed', true],
    ]);
  });

  it('startPoller survives a rejecting poll and a throwing op, and never overlaps batches', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const h = makeHarness();
      const batches: string[][] = [['{"id":"1","op":"dance"}'], [], ['{"id":"2","op":"feed"}']];
      let polls = 0;
      let inFlight = 0;
      let maxInFlight = 0;
      const stop = startPoller(
        {
          poll: async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            try {
              polls++;
              if (polls === 2) throw new Error('ipc down');
              return batches.shift() ?? [];
            } finally {
              inFlight--;
            }
          },
        },
        h.ctx,
        h.io,
        10,
      );
      await vi.advanceTimersByTimeAsync(55);
      stop();
      expect(polls).toBeGreaterThanOrEqual(4);
      expect(maxInFlight).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1); // the rejected poll, logged once
      expect(h.emitted.map((e) => [e.id, e.ok])).toEqual([
        ['1', false],
        ['2', true],
      ]);
      expect(h.actions.feed).toHaveBeenCalledTimes(1);
      const before = polls;
      await vi.advanceTimersByTimeAsync(50);
      expect(polls).toBe(before); // stopped
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
