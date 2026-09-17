// Pure notification decisions. The store calls platform.notify for each toast unless settings.notificationsMuted.
import type { PetState, SimConstants, SimEvent } from '../sim/types';
import { DEFAULT_CONSTANTS, PANTRY_LOW_DAYS, PANTRY_LOW_HUNGER_MAX } from '../sim/constants';
import { hungerAt, pantryDays } from '../sim/hunger';
import type { NotificationLatches } from './types';

export interface Toast {
  title: string;
  body: string;
}

export interface Decision {
  toasts: Toast[];
  latches: NotificationLatches;
}

export function decide(
  _prev: PetState,
  next: PetState,
  events: SimEvent[],
  now: number,
  latches: NotificationLatches,
  c: SimConstants = DEFAULT_CONSTANTS,
): Decision {
  const toasts: Toast[] = [];
  const name = next.name;
  for (const e of events) {
    switch (e.type) {
      case 'hungry':
        toasts.push({ title: name, body: `${name} is hungry.` });
        break;
      case 'starving':
        toasts.push({ title: name, body: `${name} is starving. 24h to live.` });
        break;
      case 'dying-soon':
        toasts.push({ title: name, body: `${name} has 6 hours.` });
        break;
      case 'died':
        toasts.push({ title: name, body: `${name} has died.` });
        break;
      case 'auto-fed':
        break;
    }
  }

  let pantryLowFiredForPantry = latches.pantryLowFiredForPantry;
  const days = pantryDays(next.pantry, c);
  if (days >= PANTRY_LOW_DAYS) {
    pantryLowFiredForPantry = null;
  } else if (
    next.alive &&
    next.pantry > 0 &&
    hungerAt(next, now, c) < PANTRY_LOW_HUNGER_MAX &&
    pantryLowFiredForPantry !== next.pantry
  ) {
    toasts.push({ title: name, body: 'Pantry is almost empty.' });
    pantryLowFiredForPantry = next.pantry;
  }

  return {
    toasts,
    latches: { ...latches, pantryLowFiredForPantry },
  };
}
