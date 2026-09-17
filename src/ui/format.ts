// DOM-free text formatting for the HUD, montage, memorial and dev panel.

import type { SimEvent } from '../sim/types';
import { DAY_MS, HOUR_MS } from '../sim/constants';

const MIN_MS = 60_000;

/** "3d 4h" with floors; minimum "0d 0h". Mirrors sim's formatAge so the memorial card and HUD agree. */
export function formatAge(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const days = Math.floor(safe / DAY_MS);
  const hours = Math.floor((safe - days * DAY_MS) / HOUR_MS);
  return `${days}d ${hours}h`;
}

/**
 * Compact duration: "2d 3h", "3h 12m", "12m", "0m". Used for "+42h" style dry-run offsets and montage times.
 * Negative or NaN input is treated as 0.
 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const days = Math.floor(safe / DAY_MS);
  const hours = Math.floor((safe - days * DAY_MS) / HOUR_MS);
  const mins = Math.floor((safe - days * DAY_MS - hours * HOUR_MS) / MIN_MS);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** "2d 3h ago" / "3h 12m ago" / "12m ago" / "just now" (under a minute). `deltaMs = now - at`. */
export function formatRelative(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < MIN_MS) return 'just now';
  return `${formatDuration(deltaMs)} ago`;
}

/** "+2d 3h" style offset from now for dry-run event lists. */
export function formatOffset(deltaMs: number): string {
  return `+${formatDuration(deltaMs)}`;
}

/** Local calendar date, e.g. "2026-09-17". Deterministic (no locale) so tests are stable. */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '????-??-??';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** One montage / dry-run line per sim event. Notification copy lives in app; this is display copy only. */
export function eventLine(event: SimEvent, name: string): string {
  switch (event.type) {
    case 'auto-fed':
      return `${name} ate from the pantry (${Math.round(event.hungerAfter)}%, ${event.pantryAfter} left)`;
    case 'hungry':
      return `${name} got hungry`;
    case 'starving':
      return `${name} started starving`;
    case 'dying-soon':
      return `${name} had 6 hours left`;
    case 'died':
      return `${name} died`;
  }
}

/** Events sorted chronologically (stable). reconcile() already emits them in order; this guards callers. */
export function sortEvents(events: readonly SimEvent[]): SimEvent[] {
  return [...events].sort((a, b) => a.at - b.at);
}
