// Hover HUD: a pill above the habitat (hunger ring + %, name + id, FEED, TALK, size, MIN) and a caption below it (the feeder).
// The HUD model is derived locally from AppState (see model.ts); main.ts only drives visibility and relayout.

import type { AppState } from '../app/types';
import type { Rect } from '../sim/types';
import { WINDOW_PAD } from '../sim/constants';
import type { HudHandle, UiDeps } from './types';
import { button, el, rootSize, stopDrag } from './dom';
import { nextScale } from './keys';
import { pillStripRect, rectEquals } from './hitRegions';
import { captionLow, captionText, toHudModel, type HudModel } from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 4.5;
const RING_C = 2 * Math.PI * RING_R;
/** Pill bottom edge sits this many px above the habitat grid top (WINDOW_PAD). */
const PILL_GAP = 4;
const PILL_H = 16;
const CAPTION_GAP = 4;

export interface HudOptions {
  /** TALK opens the chat field (src/ui/chatInput.ts); hidden for a pet that cannot be typed to yet. */
  onTalk?: () => void;
  canTalk?: () => boolean;
}

export function mountHud(root: HTMLElement, deps: UiDeps, opts: HudOptions = {}): HudHandle {
  const { store, scene } = deps;

  // ----- pill -----
  const pill = el('div', 'hud-pill');
  stopDrag(pill);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  const ringBg = document.createElementNS(SVG_NS, 'circle');
  ringBg.setAttribute('class', 'ring-bg');
  ringBg.setAttribute('cx', '6');
  ringBg.setAttribute('cy', '6');
  ringBg.setAttribute('r', String(RING_R));
  const ringFg = document.createElementNS(SVG_NS, 'circle');
  ringFg.setAttribute('cx', '6');
  ringFg.setAttribute('cy', '6');
  ringFg.setAttribute('r', String(RING_R));
  svg.append(ringBg, ringFg);

  const pct = el('span', 'pct');
  const name = el('span', 'name');
  const nameText = document.createTextNode('');
  const id = el('span', 'id');
  name.append(nameText, id);

  const feedBtn = button(
    'FEED',
    () => {
      store.getState().actions.feed();
    },
    'feed',
  );
  feedBtn.title = 'Feed';
  // Size, on the bar rather than buried in the tray menu. The keyboard shortcuts still work, but they
  // only reach a window that has keyboard focus, and this one never takes focus.
  const smallerBtn = button(
    '\u2212',
    () => {
      const st = store.getState();
      const next = nextScale(st.settings.scale, -1);
      if (next !== null) void st.actions.setScale(next);
    },
    'smaller',
  );
  smallerBtn.title = 'Smaller';
  const biggerBtn = button(
    '+',
    () => {
      const st = store.getState();
      const next = nextScale(st.settings.scale, 1);
      if (next !== null) void st.actions.setScale(next);
    },
    'bigger',
  );
  biggerBtn.title = 'Bigger';

  const minBtn = button(
    'MIN',
    () => {
      void store.getState().actions.setHidden(true);
    },
    'min',
  );
  minBtn.title = 'Minimize to the tray chip';

  const talkBtn = button('TALK', () => opts.onTalk?.(), 'talk');
  talkBtn.title = 'Say something';

  pill.append(svg, pct, name, feedBtn, talkBtn, smallerBtn, biggerBtn, minBtn);

  // ----- caption -----
  const caption = el('div', 'hud-caption');
  stopDrag(caption);

  root.append(pill, caption);

  let visible = false;
  let lastKey = '';
  let pillRect: Rect = { x: 0, y: 0, w: 0, h: PILL_H };
  let captionRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  function applyModel(m: HudModel): void {
    const key = JSON.stringify(m);
    if (key === lastKey) return;
    lastKey = key;
    const dash = (RING_C * m.hungerPct) / 100;
    ringFg.setAttribute('class', `ring-fg ring-${m.label}`);
    ringFg.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${RING_C.toFixed(2)}`);
    pct.textContent = `${m.hungerPct}%`;
    nameText.data = `${m.name} `;
    id.textContent = m.id;
    feedBtn.disabled = !m.canFeed;
    talkBtn.hidden = !(opts.onTalk && (opts.canTalk?.() ?? true) && m.alive);
    feedBtn.title = m.alive ? 'Feed' : `${m.name} has died`;
    pill.classList.toggle('dead', !m.alive);
    caption.textContent = captionText(m);
    caption.classList.toggle('low', captionLow(m));
    relayout();
  }

  function render(s: AppState): void {
    applyModel(toHudModel(s, s.actions.now()));
  }

  function relayout(): void {
    const hit = scene.habitatHitRect();
    const size = rootSize(root);
    const cx = Math.round(hit.x + hit.w / 2);

    const pw = pill.offsetWidth || 0;
    const ph = pill.offsetHeight || PILL_H;
    let px = Math.round(cx - pw / 2);
    px = Math.max(0, Math.min(Math.max(0, size.w - pw), px));
    const py = Math.max(0, WINDOW_PAD - PILL_GAP - ph);
    pill.style.left = `${px}px`;
    pill.style.top = `${py}px`;
    const prevPill = pillRect;
    pillRect = { x: px, y: py, w: pw, h: ph };

    const cw = caption.offsetWidth || 0;
    const ch = caption.offsetHeight || 0;
    let cxp = Math.round(cx - cw / 2);
    cxp = Math.max(0, Math.min(Math.max(0, size.w - cw), cxp));
    let cy = Math.round(hit.y + hit.h + CAPTION_GAP);
    cy = Math.max(0, Math.min(Math.max(0, size.h - ch), cy));
    caption.style.left = `${cxp}px`;
    caption.style.top = `${cy}px`;
    const prevCaption = captionRect;
    captionRect = { x: cxp, y: cy, w: cw, h: ch };
    // Resend whenever either rect moved or resized while visible (e.g. a longer pet name widens the pill and
    // re-centers it; the FEED/MIN buttons would otherwise sit outside the stale strip rect held by Rust).
    if (visible && (!rectEquals(prevPill, pillRect) || !rectEquals(prevCaption, captionRect))) {
      deps.requestHitRegions();
    }
  }

  function setVisible(b: boolean): void {
    if (b === visible) return;
    visible = b;
    if (b) relayout();
    pill.classList.toggle('show', b);
    caption.classList.toggle('show', b);
    deps.requestHitRegions();
  }

  function getRects(): Rect[] {
    if (!visible) return [];
    const hit = scene.habitatHitRect();
    return [pillStripRect(pillRect, hit.y), { ...captionRect }];
  }

  const unsub = store.subscribe((s) => render(s));
  render(store.getState());

  return {
    setVisible,
    relayout,
    getRects,
    destroy() {
      unsub();
      pill.remove();
      caption.remove();
    },
  };
}
