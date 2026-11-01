// Dev panel (Alt+Meta+D / tray "Dev panel"). Off by default. Blueprint section 10 + contract "UI API".

import type { AppState, ForcedState } from '../app/types';
import type { Habitat, Rect, Species } from '../sim/types';
import { DAY_MS, HOUR_MS } from '../sim/constants';
import type { DevPanelHandle, UiDeps } from './types';
import { button, el, relRect, stopDrag } from './dom';
import { eventLine, formatDate, formatOffset } from './format';
import { labelFor } from './model';
import { speciesModule } from '../species';
import { needsAt } from '../sim/needs';
import { regimeNow } from '../app/needsBridge';

export interface DevPanelHandleExt extends DevPanelHandle {
  open(): void;
  close(): void;
  destroy(): void;
}

const FPS_INTERVAL_MS = 500;

interface SpeciesOption {
  species: Species;
  habitat: Habitat;
  enabled: boolean;
}

/**
 * The eight species/habitat pairs of the Blueprint, with `enabled` derived from the registry rather
 * than hand-maintained.
 *
 * It used to be a literal list with one `true` in it, which meant "is this built" was recorded in two
 * places -- here and the store's guard -- and both had to be remembered. Now a species becomes
 * selectable by existing.
 */
const SPECIES_OPTIONS: readonly SpeciesOption[] = (
  [
    { species: 'fish', habitat: 'bowl' },
    { species: 'fish', habitat: 'tank' },
    { species: 'hamster', habitat: 'cage' },
    { species: 'hamster', habitat: 'terrarium' },
    { species: 'frog', habitat: 'pond' },
    { species: 'frog', habitat: 'jar' },
    { species: 'chicken', habitat: 'brooder' },
    { species: 'chicken', habitat: 'coop' },
  ] as const
).map((o) => ({ ...o, enabled: speciesModule(o.species)?.layouts[o.habitat] !== undefined }));

/** Energy, curiosity, comfort and stress at `now`, and what the pet wants to do about them. */
function needsLine(s: AppState, now: number): string {
  const regime = regimeNow(
    { pet: s.pet, dayNight: s.settings.dayNight, nightOverride: s.nightOverride, present: s.present, hunger: s.hunger },
    now,
  );
  const n = needsAt(s.needs, now, regime);
  const d = s.actions.drives(false);
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const wants = [d.nap ? 'nap' : '', d.greet ? 'greet' : '', d.hide > 0.3 ? 'hide' : '', d.approach > 0.5 ? 'approach' : ''].filter(Boolean).join(' ');
  return `energy ${pct(n.energy)} · curiosity ${pct(n.curiosity)} · comfort ${pct(n.comfort)} · stress ${pct(n.stress)} · ${s.present ? 'watched' : 'alone'} · activity ${pct(d.activity)}${wants ? ' · wants ' + wants : ''}`;
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${formatDate(ts)} ${hh}:${mm}:${ss}`;
}

function numberInput(value: string, min?: string, max?: string): HTMLInputElement {
  const input = el('input');
  input.type = 'number';
  input.value = value;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  return input;
}

function row(label: string, ...children: (HTMLElement | string)[]): HTMLDivElement {
  const r = el('div', 'row');
  const l = el('label', '', label);
  r.append(l, ...children);
  return r;
}

export function mountDevPanel(root: HTMLElement, deps: UiDeps): DevPanelHandleExt {
  const { store, scene, platform } = deps;
  const dev = () => store.getState().actions.dev;

  /**
   * Which build is on screen.
   *
   * Refreshed every time the panel opens rather than once at mount, because the interesting part --
   * `staleLaunch`, another copy of the app whose launch this process swallowed -- happens later, and
   * usually seconds after a build, which is exactly when someone opens this panel to check.
   */
  let buildLine = 'build …';
  function refreshBuild(): void {
    void platform
      .buildIdentity()
      .then((b) => {
        const linked = b.builtAtMs === null ? 'unknown' : formatClock(b.builtAtMs);
        const stale = b.staleLaunch === null ? '' : `\n!! a different copy was opened and did NOT start: ${b.staleLaunch}`;
        buildLine = `build v${b.version} · linked ${linked} · ${b.bundle}${stale}`;
      })
      .catch((e: unknown) => {
        buildLine = `build unavailable: ${String(e)}`;
      })
      .finally(() => {
        if (open) refreshStatus(store.getState());
      });
  }

  const panel = el('div', 'dev-panel');
  panel.hidden = true;
  stopDrag(panel);

  // Header ------------------------------------------------------------------
  const header = el('div', 'row');
  const title = el('h2', '', 'Dev panel');
  title.style.flex = '1';
  const closeBtn = button('CLOSE', () => close(), 'close');
  header.append(title, closeBtn);

  const status = el('div', 'status');

  // Skip --------------------------------------------------------------------
  const skipRow = row(
    'SKIP',
    button('+1H', () => dev().skip(HOUR_MS)),
    button('+12H', () => dev().skip(12 * HOUR_MS)),
    button('+3D', () => dev().skip(3 * DAY_MS)),
  );

  // Set hunger / pantry (the feeder; any amount, even past capacity) ------
  const hungerInput = numberInput('100', '0', '100');
  const hungerRow = row(
    'HUNGER',
    hungerInput,
    button('APPLY', () => {
      const n = Number(hungerInput.value);
      if (Number.isFinite(n)) dev().setHunger(n);
    }),
  );
  const pantryInput = numberInput('0', '0');
  const pantryRow = row(
    'PANTRY',
    pantryInput,
    button('APPLY', () => {
      const n = Number(pantryInput.value);
      if (Number.isFinite(n)) dev().setPantry(n);
    }),
  );
  // Force state -----------------------------------------------------------
  const forceSelect = el('select');
  const FORCED: readonly ForcedState[] = ['fed', 'hungry', 'starving', 'dead', 'asleep'];
  for (const f of FORCED) {
    const o = el('option', '', f);
    o.value = f;
    forceSelect.append(o);
  }
  const forceRow = row(
    'FORCE',
    forceSelect,
    button('APPLY', () => {
      const v = forceSelect.value;
      const match = FORCED.find((f) => f === v);
      if (match) dev().forceState(match);
    }),
  );

  // Night override ----------------------------------------------------------
  const nightSelect = el('select');
  for (const [value, label] of [
    ['follow', 'follow settings'],
    ['day', 'force day'],
    ['night', 'force night'],
  ] as const) {
    const o = el('option', '', label);
    o.value = value;
    nightSelect.append(o);
  }
  nightSelect.addEventListener('change', () => {
    const v = nightSelect.value;
    dev().setNightOverride(v === 'night' ? true : v === 'day' ? false : null);
  });
  const nightRow = row('NIGHT', nightSelect);

  // Species / habitat -------------------------------------------------------
  const speciesSelect = el('select');
  for (const opt of SPECIES_OPTIONS) {
    const o = el('option', '', `${opt.species}/${opt.habitat}${opt.enabled ? '' : ' (phase 1)'}`);
    o.value = `${opt.species}/${opt.habitat}`;
    o.disabled = !opt.enabled;
    speciesSelect.append(o);
  }
  speciesSelect.addEventListener('change', () => {
    const opt = SPECIES_OPTIONS.find((o) => `${o.species}/${o.habitat}` === speciesSelect.value);
    if (opt && opt.enabled) dev().setSpecies(opt.species, opt.habitat);
  });
  const speciesRow = row('SPECIES', speciesSelect);

  // FPS -----------------------------------------------------------------------
  const fpsValue = el('span', 'fps', '--');
  const fpsRow = row('FPS', fpsValue);

  // Simulate absence / skip on next launch / reset clock -----------------
  const output = el('pre');
  output.textContent = '(dry-run output appears here)';
  // 1000, not 500: at two meals a day ten days takes 475, so 500 would finish the run on its last meal.
  // The dry run is for seeing the shape of an absence, not for watching the feeder run dry. A feeder the
  // user fills holds three days (PANTRY_CAPACITY); this is a dev-sized one.
  const SIM_PANTRY = 1000;
  const simulateBtn = button(`SIMULATE 10-DAY ABSENCE WITH ${SIM_PANTRY} IN PANTRY`, () => {
    const s = store.getState();
    const now = s.actions.now();
    const events = dev().simulateAbsence(10, SIM_PANTRY);
    const header = `${events.length} event${events.length === 1 ? '' : 's'} over 10d with ${SIM_PANTRY} in the pantry (dry run)`;
    const lines = events.map((e) => `${formatOffset(e.at - now).padEnd(8)} ${eventLine(e, s.pet.name)}`);
    output.textContent = [header, ...lines].join('\n');
  });
  const simulateRow = row('SIM', simulateBtn);

  const note = el('span', 'note', '');
  const skipNextBtn = button('SKIP 3D ON NEXT LAUNCH', () => {
    note.textContent = 'arming…';
    dev()
      .skipOnNextLaunch(3 * DAY_MS)
      .then(() => {
        note.textContent = 'armed: quit and relaunch';
      })
      .catch((err: unknown) => {
        note.textContent = 'failed to arm';
        console.warn('[dev] skipOnNextLaunch failed', err);
      });
  });
  const skipNextRow = row('LAUNCH', skipNextBtn, note);

  const resetRow = row(
    'CLOCK',
    button('RESET CLOCK', () => {
      dev().resetClock();
      note.textContent = '';
    }),
  );

  panel.append(
    header,
    status,
    skipRow,
    hungerRow,
    pantryRow,
    forceRow,
    nightRow,
    speciesRow,
    fpsRow,
    simulateRow,
    skipNextRow,
    resetRow,
    output,
  );
  root.append(panel);

  let open = false;
  let fpsTimer: ReturnType<typeof setInterval> | null = null;

  function refreshStatus(s: AppState): void {
    const now = s.actions.now();
    const pet = s.pet;
    const hunger = pet.alive ? s.hunger : 0;
    const parts = [
      buildLine,
      `now ${formatClock(now)} (offset ${formatOffset(s.settings.devClockOffsetMs)})`,
      `${pet.name} ${pet.id} · ${pet.alive ? 'alive' : 'dead'} · ${pet.personality} · ${pet.rarity}`,
      `hunger ${hunger.toFixed(1)}% ${labelFor(hunger)} · pantry ${pet.pantry} · meals ${pet.meals}`,
      `night ${s.night ? 'on' : 'off'} (override ${s.nightOverride === null ? 'none' : s.nightOverride ? 'night' : 'day'}) · scale ${s.settings.scale}x · ${s.hidden ? 'hidden' : 'shown'}`,
      needsLine(s, now),
    ];
    status.textContent = parts.join('\n');
    nightSelect.value = s.nightOverride === null ? 'follow' : s.nightOverride ? 'night' : 'day';
    speciesSelect.value = `${pet.species}/${pet.habitat}`;
  }

  function seedInputs(s: AppState): void {
    hungerInput.value = String(Math.round(s.pet.alive ? s.hunger : 0));
    pantryInput.value = String(s.pet.pantry);
  }

  function tickFps(): void {
    let fps = 0;
    try {
      fps = scene.fps();
    } catch {
      fps = 0;
    }
    fpsValue.textContent = Number.isFinite(fps) ? fps.toFixed(0) : '--';
  }

  function openPanel(): void {
    if (open) return;
    open = true;
    refreshBuild();
    const s = store.getState();
    seedInputs(s);
    refreshStatus(s);
    panel.hidden = false;
    tickFps();
    fpsTimer = setInterval(tickFps, FPS_INTERVAL_MS);
    deps.requestHitRegions();
  }

  function close(): void {
    if (!open) return;
    open = false;
    panel.hidden = true;
    if (fpsTimer) {
      clearInterval(fpsTimer);
      fpsTimer = null;
    }
    deps.requestHitRegions();
  }

  function toggle(): void {
    if (open) close();
    else openPanel();
  }

  function getRect(): Rect | null {
    if (!open) return null;
    return relRect(panel, root);
  }

  const unsub = store.subscribe((s) => {
    if (open) refreshStatus(s);
  });

  return {
    toggle,
    isOpen: () => open,
    getRect,
    open: openPanel,
    close,
    destroy() {
      close();
      unsub();
      panel.remove();
    },
  };
}
