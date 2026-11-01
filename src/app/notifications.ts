// Pure notification decisions. The store calls platform.notify for each toast unless settings.notificationsMuted.
import type { PetState, SimConstants, SimEvent } from '../sim/types';
import { DEFAULT_CONSTANTS, DYING_SOON_HOURS, PANTRY_LOW_DAYS, PANTRY_LOW_HUNGER_MAX } from '../sim/constants';
import { hungerAt, pantryDays } from '../sim/hunger';
import type { NotificationLatches } from './types';

/** The holiday feeder (the pantry, in code) has under PANTRY_LOW_DAYS of food left. */
export const FEEDER_LOW_BODY = 'The feeder is almost empty.';

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
        // Both numbers come from the constants they describe. They were literals ("24h to live", "has
        // 6 hours") and went stale the moment the hunger clock was retuned -- a notification that
        // confidently states the wrong deadline is worse than one that states none.
        toasts.push({ title: name, body: `${name} is starving. ${c.DEATH_AFTER_ZERO_HOURS}h to live.` });
        break;
      case 'dying-soon':
        toasts.push({ title: name, body: `${name} has ${DYING_SOON_HOURS} hours.` });
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
    toasts.push({ title: name, body: FEEDER_LOW_BODY });
    pantryLowFiredForPantry = next.pantry;
  }

  return {
    toasts,
    latches: { ...latches, pantryLowFiredForPantry },
  };
}
