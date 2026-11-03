// Speech bubbles. The brain decides what the pet says and when (src/brain, glued in ./talk.ts); this
// draws it: a soft bubble above the habitat, one at a time. Tap a fact to see where it comes from,
// then tap the source to open it. Off when the tray's "Pet talks" is unticked, silent when the pet has died.

import type { AppState } from '../app/types';
import type { Rect } from '../render/types';
import type { Utterance } from '../brain/types';
import type { Reaction } from '../brain/talk';
import { speciesModule } from '../species';
import { createTalk, type TalkController, type TalkMemory, type Volunteer } from './talk';
import type { SpeechHandle, UiDeps } from './types';
import { el, rootSize } from './dom';
import { labelFor } from './model';

export interface SpeechHandleExt extends SpeechHandle {
  /** Something happened to the pet (a knock on the glass, the welcome back after a montage). */
  react(moment: Reaction): void;
  /** Re-position the bubble for a new scale / canvas size (no-op while hidden). */
  relayout(): void;
  /** Window-local rects that must take the mouse while the bubble shows: just the source link. */
  getRects(): Rect[];
  /** What the pet has said lately, newest last (dev panel, harness). */
  transcript(): readonly SaidLine[];
  /** Seconds since you last typed, as the brain sees it (harness). */
  typedAgo(): number;
  /** Nobody can see the pet (off screen, or a full-screen app in front), as the brain sees it (harness). */
  unseen(): boolean;
  /** Say a thought or a fact now, skipping the timing (harness stills). */
  speak(v: Volunteer): void;
  /** Keep quiet while something else has the stage (the "while you were gone" montage). */
  hold(b: boolean): void;
  /** Run the talk clock this many times faster (harness recordings); 1 is real time. */
  setTimeScale(k: number): void;
  destroy(): void;
}

export interface SaidLine {
  at: number;
  text: string;
  kind: Utterance['kind'];
}

/** The file that keeps what the pet has said and when it last spoke, so a relaunch does not repeat itself. */
export const BRAIN_FILE = 'brain.json';
const BRAIN_VERSION = 1;
/** Bubble bottom edge overlaps the habitat's opaque top by this much so it visibly "belongs" to the bowl. */
const BUBBLE_OVERLAP = 8;
/** Space between the HUD bar and a bubble pushed down below it. */
const HUD_GAP = 6;
/** Typing within this many seconds counts as busy: nothing volunteered. */
const BUSY_TYPING_S = 8;
const IDLE_POLL_MS = 2000;
const TICK_MS = 1000;
const DISK_SAVE_MS = 30_000;
const TRANSCRIPT_MAX = 200;

function durationFor(u: Utterance): number {
  const base = Math.min(9000, 2500 + u.text.length * 55);
  return u.more ? base + 2500 : base;
}

function timeOfDay(h: number): string {
  if (h < 5) return 'it is the middle of the night';
  if (h < 12) return 'it is morning';
  if (h < 17) return 'it is afternoon';
  if (h < 21) return 'it is evening';
  return 'it is night';
}

const HUNGER_WORDS = { full: 'you are full', peckish: 'you are a little peckish', hungry: 'you are hungry', starving: 'you are very hungry' } as const;

export function mountSpeech(root: HTMLElement, deps: UiDeps): SpeechHandleExt {
  const { store, scene, platform } = deps;
  const bubble = el('div', 'speech-bubble');
  const text = el('div', 'speech-text');
  const more = el('button', 'speech-more');
  more.type = 'button';
  bubble.append(text, more);
  bubble.hidden = true;
  root.append(bubble);

  let current: Utterance | null = null;
  let expanded = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let hovering = false;
  let typedAgoS = Number.MAX_VALUE;
  let unseen = false;
  let timeScale = 1;
  let clockBase = Date.now();
  let virtualBase = clockBase;
  const said: SaidLine[] = [];

  const now = (): number => virtualBase + (Date.now() - clockBase) * timeScale;
  const st = (): AppState => store.getState();

  function position(): void {
    const hit = scene.habitatHitRect();
    const size = rootSize(root);
    bubble.style.maxWidth = `${Math.max(64, Math.min(210, size.w - 8))}px`;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    let x = Math.round(hit.x + hit.w / 2 - w / 2);
    x = Math.max(0, Math.min(Math.max(0, size.w - w), x));
    let y = Math.max(0, Math.round(hit.y + BUBBLE_OVERLAP - h));
    // While you hover, the HUD bar sits along the top: the bubble drops below it rather than over it.
    const pill = root.querySelector<HTMLElement>('.hud-pill.show');
    if (pill) y = Math.max(y, pill.offsetTop + pill.offsetHeight + HUD_GAP);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  function hide(): void {
    bubble.hidden = true;
    current = null;
    expanded = false;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    deps.requestHitRegions();
  }

  function armHide(ms: number): void {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (hovering) armHide(1500);
      else hide();
    }, ms);
  }

  function render(): void {
    if (!current) return;
    text.textContent = current.text;
    const m = current.more;
    more.hidden = !m;
    if (m) more.textContent = expanded ? `${m.label} ↗` : 'Where’s that from?';
    bubble.classList.toggle('expanded', expanded);
    position();
  }

  function show(u: Utterance): void {
    current = u;
    expanded = false;
    bubble.hidden = false;
    render();
    armHide(durationFor(u));
    deps.requestHitRegions();
    said.push({ at: now(), text: u.text, kind: u.kind });
    if (said.length > TRANSCRIPT_MAX) said.splice(0, said.length - TRANSCRIPT_MAX);
  }

  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = current?.more;
    if (!m) return;
    if (!expanded) {
      expanded = true;
      render();
      armHide(10_000);
      deps.requestHitRegions();
      return;
    }
    platform.openLink(m.url).catch(() => undefined);
    hide();
  });
  // The bubble itself is click-through (styles.css); only the source link takes the mouse. Hovering it
  // holds the bubble open, and pressing it is not a knock on the glass or the start of a window drag.
  more.addEventListener('mouseenter', () => (hovering = true));
  more.addEventListener('mouseleave', () => (hovering = false));
  more.addEventListener('mousedown', (e) => e.stopPropagation());
  // Follow the HUD bar coming and going while a bubble is up.
  const hudWatch = new MutationObserver(() => {
    if (!bubble.hidden) position();
  });
  for (const p of root.querySelectorAll('.hud-pill')) hudWatch.observe(p, { attributes: true, attributeFilter: ['class'] });

  // The brain --------------------------------------------------------------
  let talk: TalkController | null = null;
  let lastDiskSave = 0;
  const writer =
    platform.kind === 'tauri'
      ? {
          available: () => platform.voice.status().then((s) => s.hasKey),
          write: (p: { system: string; user: string }) => platform.voice.write(p.system, p.user),
        }
      : null;

  function save(m: TalkMemory): void {
    const doc = { version: BRAIN_VERSION, ...m };
    platform.store.set(BRAIN_FILE, doc).catch(() => undefined);
    if (Date.now() - lastDiskSave > DISK_SAVE_MS) {
      lastDiskSave = Date.now();
      platform.store.save(BRAIN_FILE).catch(() => undefined);
    }
  }

  function situation(): string[] {
    const s = st();
    const out = [timeOfDay(new Date(now()).getHours()), HUNGER_WORDS[labelFor(s.hunger)]];
    if (s.present) out.push('the person is right here watching you');
    return out;
  }

  platform.store
    .load<unknown>(BRAIN_FILE)
    .catch(() => null)
    .then((doc) => {
      talk = createTalk({
        now,
        rng: Math.random,
        pet: () => {
          const p = st().pet;
          return { species: p.species, personality: p.personality, name: p.name, alive: p.alive };
        },
        voice: (species) => speciesModule(species)?.voice ?? null,
        present: () => st().present,
        night: () => st().night,
        awake: () => !st().night,
        busy: () => typedAgoS < BUSY_TYPING_S || unseen,
        muted: () => st().settings.talkMuted,
        stillTrue: (m) => labelFor(st().hunger) === m,
        situation,
        writer,
        dailyCapUsd: () => st().settings.dailyCapUsd,
        load: () => doc,
        save,
        show,
      });
    });

  let held = false;
  const tickTimer = setInterval(() => {
    if (!held) talk?.tick();
  }, TICK_MS);
  const idleTimer = setInterval(() => {
    platform.inputIdle().then(
      (i) => {
        typedAgoS = i.keys;
        unseen = i.unseen;
      },
      () => {
        typedAgoS = Number.MAX_VALUE;
        unseen = false;
      },
    );
  }, IDLE_POLL_MS);

  function react(moment: Reaction): void {
    talk?.react(moment);
  }

  // Triggers ---------------------------------------------------------------
  // One "fed" line per meal (on its first bite), and a "meal" line when the pinch is finished.
  let bitesThisMeal = 0;
  const offBite = scene.on('bite', () => {
    if (bitesThisMeal === 0) react('fed');
    bitesThisMeal++;
  });
  const offGone = scene.on('flakes-gone', () => {
    if (bitesThisMeal > 0) react('meal');
    bitesThisMeal = 0;
  });

  let lastPetId = st().pet.id;
  let lastLabel = labelFor(st().hunger);
  const unsub = store.subscribe((s: AppState, prev: AppState) => {
    if (s.pet.id !== lastPetId) {
      lastPetId = s.pet.id;
      lastLabel = labelFor(s.hunger);
      talk?.reset();
      hide();
      return;
    }
    if (!s.pet.alive || s.settings.talkMuted) {
      if (!bubble.hidden) hide();
      return;
    }
    if (s.lastFeedEvent !== prev.lastFeedEvent) bitesThisMeal = 0;
    const label = labelFor(s.hunger);
    if (label === lastLabel) return;
    lastLabel = label;
    if (label === 'hungry') react('hungry');
    else if (label === 'starving') react('starving');
  });

  return {
    say(line: string) {
      show({ id: `dev:${Date.now()}`, text: line, kind: 'thought' });
    },
    setMuted(b: boolean) {
      store.getState().actions.setTalkMuted(b);
    },
    react,
    relayout() {
      if (!bubble.hidden) position();
    },
    getRects() {
      if (bubble.hidden || more.hidden) return [];
      return [{ x: bubble.offsetLeft + more.offsetLeft, y: bubble.offsetTop + more.offsetTop, w: more.offsetWidth, h: more.offsetHeight }];
    },
    transcript: () => said,
    typedAgo: () => typedAgoS,
    unseen: () => unseen,
    speak(v: Volunteer) {
      talk?.speak(v);
    },
    hold(b: boolean) {
      held = b;
      if (b) hide();
    },
    setTimeScale(k: number) {
      virtualBase = now();
      clockBase = Date.now();
      timeScale = Math.max(1, k);
    },
    destroy() {
      offBite();
      offGone();
      unsub();
      clearInterval(tickTimer);
      clearInterval(idleTimer);
      hudWatch.disconnect();
      hide();
      bubble.remove();
    },
  };
}
