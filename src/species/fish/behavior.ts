// Fish behavior: a motion planner. Pure: no Pixi, no DOM. One step() = one 8 fps tick.
//
// Every distance and speed is in habitat grid px (320x240) per tick. Positions are continuous.
//
// The fish used to swim a figure-eight: a parametric curve with a wobble, so the same loop forever.
// It now plans LEGS: it picks a waypoint, swims there along an arc sampled by distance (so its speed
// is what it decided, not what the curve happened to give), with a speed that builds and bleeds and
// a facing that only flips when the travel direction really has, then hangs for a moment and picks
// the next. Where the waypoints go and how fast it swims come from the DRIVES (`src/sim/needs.ts`):
// a rested fish ranges wide and fast, a tired one hovers and naps on the gravel in daylight, a
// curious one comes to the glass, a rattled one keeps to the plant and the floor, a peckish one
// visits the surface and gulps. Personality shows here too, as pace and how often it darts.
//
// What outranks all of that, in order: dead; food (a lunge, the one thing it will always do); night
// sleep; a nap; starving (on the floor, barely moving); a startle from a tap on the glass.

import type { FishBehavior, FishInput, FishOutput, PetAct, PetAnim, WaterBounds } from '../../render/types';
import type { HungerLabel, Personality } from '../../sim/types';
import type { Drives } from '../../sim/needs';
import { alongArc, approachSpeed, arc, arcHeading, dartSpeed, noise1, type Arc } from '../../sim/motion';
import { FISH_MOUTH_AHEAD, FISH_MOUTH_REACH } from './layout';

/** Ticks the eat animation is reported after a bite (matches the 4-frame eat strip). */
const EAT_TICKS = 4;
/** Minimum ticks between two facing changes. */
const TURN_COOLDOWN = 6;
/** Horizontal component of the travel direction needed before the fish commits to a new facing. */
const TURN_DEAD_ZONE = 0.3;
/** Ticks a finished meal is celebrated for: an excited lap of the bowl. */
const CELEBRATE_TICKS = 22;
/** Away this long (3 s) and the pointer coming back is an ARRIVAL, which earns a look. */
const ARRIVAL_AWAY_TICKS = 24;
/** A look at the viewer: two seconds, still, face turned out of the glass. */
const LOOK_TICKS = 16;
/** Laps: legs of this many radians round an ellipse this fraction of the swimmable half-extents. */
const LAP_STEP = 0.95;
const LAP_RX = 0.85;
const LAP_RY = 0.45;
/** Per-leg odds, at full activity, of starting a lap or going to pick at the gravel. */
const LAP_ODDS = 0.09;
const FORAGE_ODDS = 0.11;
/** Gravel picking, ticks: a peck, the pause between pecks, the spit, the hover after. */
const PECK_TICKS = 4;
const PECK_GAP = 3;
const SPIT_TICKS = 3;
const AFTER_TICKS = 6;
/** Following the pointer: how close an approach has to be wanted, and the patrol either side of it. */
const FOLLOW_MIN = 0.5;
const FOLLOW_OFFSET = 12;
/** Night rest: drift speed along the bed, px/tick, and how long between new drift targets. */
const REST_SPEED = 0.35;
const REST_RETARGET = 48;
/** Cruise speed of a content, rested fish, px/tick, before pace and activity. */
const CRUISE = 2.4;
/** Speed inertia: builds quickly, bleeds slowly — the drag of water. */
const SPEED_TUNING = { accel: 0.35, decel: 0.14 } as const;
/** How far toward something interesting a waypoint can be pulled, at full strength. Well under 1 on purpose. */
const ATTRACT_MAX = 0.55;
/** Longest hang between legs, ticks, for a pet with nothing to do. */
const PAUSE_MAX_TICKS = 18;
/** A dart's peak speed and the ticks it takes to bleed to a tenth. */
const DART_PEAK = 6;
const DART_TICKS = 10;
/** A surface visit: how long it hangs at the top, and the ticks of the gape inside that. */
const SURFACE_HOLD_TICKS = 12;
/**
 * Odds of a surface visit per leg chosen, at full surface drive. Per LEG, not per tick (the comment
 * used to say tick): at 0.012 a fish that badly wanted the surface went 300 s without a visit once
 * laps and gravel picking took their share of the legs.
 */
const SURFACE_ODDS = 0.06;

/** What the fish does with no needs model wired (tests, a bare scene): a rested, settled fish. */
const DEFAULT_DRIVES: Drives = { activity: 0.65, approach: 1, hide: 0, nap: false, greet: false, surface: 0 };

/**
 * Pace, restlessness (how long it hangs between legs) and the odds of a spontaneous dart per leg,
 * per personality. The rest of what a personality does to motion comes through the drives.
 */
const PACE: Readonly<Record<Personality, { pace: number; hang: number; dartOdds: number; lookDelay: number }>> = {
  zen: { pace: 0.8, hang: 1.3, dartOdds: 0.0008, lookDelay: 6 },
  sarcastic: { pace: 0.95, hang: 1.0, dartOdds: 0.0015, lookDelay: 12 },
  anxious: { pace: 1.05, hang: 0.8, dartOdds: 0.004, lookDelay: 2 },
  degen: { pace: 1.25, hang: 0.45, dartOdds: 0.006, lookDelay: 1 },
};

function lungeSpeed(label: HungerLabel): number {
  switch (label) {
    case 'starving':
      return 2;
    case 'hungry':
      return 4;
    default:
      return 6;
  }
}

function moveToward(x: number, y: number, tx: number, ty: number, maxStep: number): { x: number; y: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d === 0) return { x: tx, y: ty };
  const k = maxStep / d;
  return { x: x + dx * k, y: y + dy * k };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A leg of travel: an arc, how far along it the fish is, and the speed it wants on it. */
interface Leg {
  arc: Arc;
  dist: number;
  speed: number;
  /** A burst: speed follows the dart profile from this tick count rather than the cruise. */
  dartTick: number;
  kind: 'wander' | 'approach' | 'hide' | 'surface' | 'dart' | 'greet' | 'startle' | 'lap' | 'forage' | 'follow';
}

export function createFishBehavior(): FishBehavior {
  let inited = false;
  let x = 0;
  let y = 0;
  let facing: 1 | -1 = 1;
  let speed = 0;
  let eatTicks = 0;
  let turnCooldown = 0;
  let leg: Leg | null = null;
  let legCount = 0;
  let pauseTicks = 0;
  let surfaceHold = 0;
  let greeted = false;
  let driftVx = 0.3;
  let driftTicks = 0;
  /** Seeds the no-loop noise; drawn once per behaviour so two fish never share a wander. */
  let seed = 0;
  /** The feed in progress: ticks since the food arrived (-1: none), and how many flakes it has taken. */
  let feedTicks = -1;
  let feedBites = 0;
  /** Ticks of celebration left after a finished meal, and whether its lap is still to start. */
  let celebrate = 0;
  let lapPending = false;
  /** Someone at the glass: ticks since the pointer was last there, the look it is owed, the look. */
  let awayTicks = ARRIVAL_AWAY_TICKS;
  let lookIn = -1;
  let lookTicks = 0;
  /** A lap in progress: legs left, which way round, the angle reached. */
  let lapLegs = 0;
  let lapDir: 1 | -1 = 1;
  let lapAngle = 0;
  /** Gravel picking, once it has reached the bed. */
  let forage: { phase: 'peck' | 'hold' | 'spit' | 'after'; ticks: number; pecks: number; hold: number } | null = null;
  /** Night rest: where along the bed it is drifting, and when it picks somewhere else. */
  let restX = 0;
  let restIn = 0;
  /** Which side of the pointer the next follow leg patrols to. */
  let followSide: 1 | -1 = 1;

  const reset = (): void => {
    inited = false;
    x = 0;
    y = 0;
    facing = 1;
    speed = 0;
    eatTicks = 0;
    turnCooldown = 0;
    leg = null;
    legCount = 0;
    pauseTicks = 0;
    surfaceHold = 0;
    greeted = false;
    driftVx = 0.3;
    driftTicks = 0;
    seed = 0;
    feedTicks = -1;
    feedBites = 0;
    celebrate = 0;
    lapPending = false;
    awayTicks = ARRIVAL_AWAY_TICKS;
    lookIn = -1;
    lookTicks = 0;
    lapLegs = 0;
    lapDir = 1;
    lapAngle = 0;
    forage = null;
    restX = 0;
    restIn = 0;
    followSide = 1;
  };

  const init = (bounds: WaterBounds, halfW: number, halfH: number, rng: () => number): void => {
    const c = bounds.clamp(bounds.rect.x + bounds.rect.w / 2, (bounds.surfaceY + bounds.floorY) / 2, halfW, halfH);
    x = c.x;
    y = c.y;
    seed = Math.floor(rng() * 1e9);
    inited = true;
  };

  /** The legal centre band for this hunger: content fish use the whole water, hungry ones the top third. */
  const band = (bounds: WaterBounds, halfH: number, label: HungerLabel): { yMin: number; yMax: number } => {
    const legalTop = bounds.surfaceY + halfH;
    const legalBottom = bounds.floorY - halfH;
    if (label === 'hungry') return { yMin: legalTop + 2, yMax: legalTop + (legalBottom - legalTop) / 3 };
    return { yMin: legalTop + 4, yMax: legalBottom - 4 };
  };

  /** Where to hide: behind the plants on the right of the bed, low. In grid px of the water rect. */
  const hideSpot = (bounds: WaterBounds, halfH: number): { x: number; y: number } => ({
    x: bounds.rect.x + bounds.rect.w * 0.68,
    y: bounds.floorY - halfH - 6,
  });

  const startLeg = (
    tx: number,
    ty: number,
    legSpeed: number,
    kind: Leg['kind'],
    bulge: number,
    dart: boolean,
    bounds: WaterBounds,
    halfW: number,
    halfH: number,
  ): void => {
    const to = bounds.clamp(tx, ty, halfW, halfH);
    legCount += 1;
    leg = { arc: arc({ x, y }, to, bulge), dist: 0, speed: legSpeed, dartTick: dart ? 0 : -1, kind };
  };

  const step = (input: FishInput): FishOutput => {
    const { bounds, body, rng } = input;
    const halfW = body.w / 2;
    const halfH = body.h / 2;
    if (!inited) init(bounds, halfW, halfH, rng);
    const drives = input.drives ?? DEFAULT_DRIVES;
    const pers = PACE[input.personality ?? 'zen'];
    // A zero strength is no interest at all, by contract.
    const attract = input.attract && input.attract.strength > 0 ? input.attract : null;
    if (turnCooldown > 0) turnCooldown -= 1;
    if (eatTicks > 0) eatTicks -= 1;
    if (celebrate > 0) celebrate -= 1;
    // The meal is over when the food is gone. One that was eaten (not just watched dissolve) earns a lap.
    if (input.flakes.length === 0 && feedTicks >= 0) {
      if (feedBites > 0 && input.alive) {
        celebrate = CELEBRATE_TICKS;
        lapPending = true;
      }
      feedTicks = -1;
      feedBites = 0;
    }
    /** The way something makes the fish face this tick: food, or the viewer it is looking at (0: none). */
    let wantFacing: 1 | -1 | 0 = 0;
    let act: PetAct | undefined;

    // ---- dead: belly-up at the surface, nothing else moves
    if (!input.alive) {
      const c = bounds.clamp(x, bounds.surfaceY, halfW, halfH);
      x = c.x;
      y = c.y;
      eatTicks = 0;
      leg = null;
      speed = 0;
      return { x, y, facing, turning: false, anim: 'dead', biteFlakeIndex: null };
    }

    const prevX = x;
    const prevY = y;
    let anim: PetAnim = 'idle';
    let bite: number | null = null;
    let nx = x;
    let ny = y;
    let lockFacing = false;

    if (input.flakes.length > 0) {
      // ---- food outranks everything. The fish turns to the nearest flake and takes it with its MOUTH:
      // a dart when the food lands, then the chase, then a snap. Choosing by where the body box can
      // reach keeps "nearest" meaning nearest; biting by the mouth is what makes it look like eating.
      leg = null;
      surfaceHold = 0;
      celebrate = 0;
      lapPending = false;
      forage = null;
      lapLegs = 0;
      lookTicks = 0;
      feedTicks = feedTicks < 0 ? 0 : feedTicks + 1;
      const reach = (f: { x: number; y: number }): number =>
        Math.hypot(Math.max(0, Math.abs(f.x - x) - halfW), Math.max(0, Math.abs(f.y - y) - halfH));
      let best = 0;
      let bestD = Infinity;
      input.flakes.forEach((f, i) => {
        const d = reach(f);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const flake = input.flakes[best];
      if (flake !== undefined) {
        const dir: 1 | -1 = Math.abs(flake.x - x) < 2 ? facing : flake.x > x ? 1 : -1;
        wantFacing = dir;
        const mouthD = Math.hypot(flake.x - (x + facing * FISH_MOUTH_AHEAD), flake.y - y);
        if (dir === facing && mouthD <= FISH_MOUTH_REACH) {
          bite = best;
          eatTicks = EAT_TICKS;
          feedBites += 1;
          speed = 0;
        } else {
          // the burst of a fish that has seen food land, settling into the hunger's lunge
          const burst = input.label === 'starving' ? 0 : dartSpeed(feedTicks, DART_PEAK * 1.15, DART_TICKS);
          speed = Math.max(lungeSpeed(input.label), burst);
          const t = moveToward(x, y, flake.x - dir * FISH_MOUTH_AHEAD, flake.y, speed);
          nx = t.x;
          ny = t.y;
        }
      }
      anim = input.label === 'hungry' || input.label === 'starving' ? 'hungry' : 'idle';
    } else if (input.asleep || drives.nap) {
      // ---- asleep (night) or napping (exhausted in daylight): low over the gravel, drifting very
      // slowly along the bed, as a goldfish rests at night; down quickly first if it is up high
      leg = null;
      surfaceHold = 0;
      forage = null;
      lapLegs = 0;
      lookTicks = 0;
      speed = 0;
      const ty = bounds.floorY - halfH - 2;
      const rcx = bounds.rect.x + bounds.rect.w / 2;
      const rAmp = Math.max(8, (bounds.rect.w / 2 - halfW) * 0.6);
      if (restIn <= 0) {
        restX = clamp(x + (rng() * 2 - 1) * 22, rcx - rAmp, rcx + rAmp);
        restIn = REST_RETARGET + Math.floor(rng() * REST_RETARGET);
      } else {
        restIn -= 1;
      }
      const t = moveToward(x, y, restX, ty, y < ty - 4 ? 1.5 : REST_SPEED);
      nx = t.x;
      ny = t.y;
      anim = 'sleep';
      act = 'rest';
    } else if (input.label === 'starving') {
      // ---- starving: on the floor, barely drifting
      leg = null;
      speed = 0;
      driftTicks += 1;
      if (driftTicks >= 40) {
        driftTicks = 0;
        driftVx = (rng() < 0.5 ? -1 : 1) * 0.3;
        facing = driftVx > 0 ? 1 : -1;
      }
      const ty = bounds.floorY - halfH - 4;
      const t = moveToward(x, y, x, ty, 1);
      ny = t.y;
      nx = x + driftVx;
      anim = 'hungry';
    } else {
      // ---- awake and fed enough to have a mind of its own: plan and swim legs
      const hungry = input.label === 'hungry';
      const { yMin, yMax } = band(bounds, halfH, hungry ? 'hungry' : 'full');
      const cx = bounds.rect.x + bounds.rect.w / 2;
      const ampX = Math.max(8, (bounds.rect.w / 2 - halfW) * 0.8);
      const activity = clamp(drives.activity, 0, 1);
      const cruise = CRUISE * (0.45 + 0.75 * activity) * pers.pace * (hungry ? 0.6 : 1);

      // A tap on the glass: a startle dart away from it, whatever else was planned.
      if (input.tap && !hungry) {
        const away = x >= input.tap.x ? 1 : -1;
        startLeg(x + away * 48, Math.min(yMax, y + 10), DART_PEAK, 'startle', 0, true, bounds, halfW, halfH);
        pauseTicks = 0;
      }
      // A greeting: once per greet window, a dart to the glass where the pointer is.
      if (drives.greet && !greeted && attract && !hungry) {
        greeted = true;
        startLeg(attract.x, clamp(attract.y, yMin, yMax), DART_PEAK * 0.85, 'greet', 0, true, bounds, halfW, halfH);
        pauseTicks = 0;
      }
      if (!drives.greet) greeted = false;
      // A finished meal: a quick, curving lap across the bowl.
      if (lapPending && !hungry) {
        lapPending = false;
        const across = x >= cx ? -1 : 1;
        startLeg(cx + across * ampX * 0.85, (yMin + yMax) / 2, DART_PEAK * 1.1, 'dart', across * 14, true, bounds, halfW, halfH);
        pauseTicks = 0;
      }
      // Someone arriving at the glass: after a moment (the personality's), it stops and looks out.
      if (!hungry) {
        if (attract) {
          if (awayTicks >= ARRIVAL_AWAY_TICKS) lookIn = pers.lookDelay;
          awayTicks = 0;
        } else {
          awayTicks += 1;
          lookIn = -1;
        }
        if (lookIn >= 0 && !(leg !== null && leg.dartTick >= 0)) {
          if (lookIn === 0) {
            lookTicks = LOOK_TICKS;
            leg = null;
            forage = null;
            lapLegs = 0;
            surfaceHold = 0;
          }
          lookIn -= 1;
        }
      }
      if (input.tap) {
        lookTicks = 0;
        forage = null;
        lapLegs = 0;
      }

      if (lookTicks > 0) {
        // ---- looking out at the viewer: still, face turned out of the glass
        lookTicks -= 1;
        leg = null;
        speed = approachSpeed(speed, 0, SPEED_TUNING);
        act = 'look';
        if (attract) wantFacing = attract.x >= x ? 1 : -1;
        if (lookTicks === 0) pauseTicks = 4;
      } else if (leg === null && forage !== null) {
        // ---- at the bed: peck, perhaps take a pebble, mouth it while backing off, spit it out. It
        // keeps facing the way it pecked: backing off is not swimming the other way.
        forage.ticks += 1;
        speed = 0;
        lockFacing = true;
        if (forage.phase === 'peck') {
          const t = forage.ticks % (PECK_TICKS + PECK_GAP);
          act = t < PECK_TICKS ? 'peck' : 'hover';
          if (t === PECK_TICKS + PECK_GAP - 1) {
            forage.pecks -= 1;
            if (forage.pecks <= 0) {
              forage.phase = rng() < 0.65 ? 'hold' : 'after';
              forage.ticks = 0;
            }
          }
        } else if (forage.phase === 'hold') {
          act = 'mouthful';
          const back = bounds.clamp(x - facing * 0.4, y - 0.5, halfW, halfH);
          nx = back.x;
          ny = back.y;
          if (forage.ticks >= forage.hold) {
            forage.phase = 'spit';
            forage.ticks = 0;
          }
        } else if (forage.phase === 'spit') {
          act = 'spit';
          if (forage.ticks >= SPIT_TICKS) {
            forage.phase = 'after';
            forage.ticks = 0;
          }
        } else {
          act = 'hover';
          if (forage.ticks >= AFTER_TICKS) {
            forage = null;
            pauseTicks = 4;
          }
        }
      } else if (leg === null && surfaceHold > 0) {
        // ---- hanging at the surface, nose at the waterline: two gulps
        surfaceHold -= 1;
        const gulping = surfaceHold === SURFACE_HOLD_TICKS - 3 || surfaceHold === SURFACE_HOLD_TICKS - 4 || surfaceHold === 3 || surfaceHold === 2;
        if (gulping) anim = 'eat';
        act = gulping ? 'gulp' : 'hover';
        speed = 0;
      } else if (leg === null && pauseTicks > 0) {
        // ---- hanging between legs: hovering, the pectorals doing the work; facing the viewer if one is there
        pauseTicks -= 1;
        speed = approachSpeed(speed, 0, SPEED_TUNING);
        act = 'hover';
        if (attract && !hungry && clamp(attract.strength * drives.approach, 0, 1) >= FOLLOW_MIN) wantFacing = attract.x >= x ? 1 : -1;
      } else if (leg === null && lapLegs > 0) {
        // ---- the next leg of a lap: round the middle ring, curving outward
        lapLegs -= 1;
        lapAngle += lapDir * LAP_STEP;
        const tx = cx + Math.cos(lapAngle) * ampX * LAP_RX;
        const ty = (yMin + yMax) / 2 + Math.sin(lapAngle) * (yMax - yMin) * LAP_RY;
        const len = Math.hypot(tx - x, ty - y);
        startLeg(tx, ty, cruise * 0.95, 'lap', lapDir * len * 0.2, false, bounds, halfW, halfH);
      } else if (leg === null) {
        // ---- choose the next leg
        // The waypoint comes from the seeded NOISE over the leg count, not from the rng: that is what
        // makes the wander a path rather than a lottery (and keeps it from collapsing when a caller
        // hands over a degenerate rng). The rng only decides the rare things: a dart, a surface visit.
        const n = noise1(seed, legCount * 0.73);
        const n2 = noise1(seed + 101, legCount * 0.61);
        const u = noise1(seed + 3, legCount * 0.83);
        const v = noise1(seed + 11, legCount * 0.57);
        const yMid = (yMin + yMax) / 2;
        const aimX = clamp(cx + u * ampX, cx - ampX, cx + ampX);
        const aimY = clamp(yMid + v * (yMax - yMin) * 0.55, yMin, yMax);
        // How much of the way to the aim this leg covers: a tired fish takes short legs toward it.
        const reach = 0.35 + 0.65 * activity;
        let tx = x + (aimX - x) * reach;
        let ty = y + (aimY - y) * reach;
        let kind: Leg['kind'] = 'wander';
        let dart = rng() < pers.dartOdds * (0.5 + activity);
        const follow = !hungry && attract !== null && clamp(attract.strength * drives.approach, 0, 1) >= FOLLOW_MIN;
        const pick = rng();
        if (follow && attract) {
          // Following someone along the glass: a short leg to just beside the pointer, alternating
          // sides, so it patrols in front of you rather than parking on the spot.
          followSide = followSide === 1 ? -1 : 1;
          tx = attract.x + followSide * (FOLLOW_OFFSET + 6 * (n2 + 1));
          ty = clamp(attract.y + v * 8, yMin, yMax);
          kind = 'follow';
          dart = false;
        } else if (!hungry && drives.surface > 0.05 && rng() < SURFACE_ODDS * drives.surface) {
          // A surface visit: straight up-ish, slow, then a hold at the waterline with two gulps.
          tx = clamp(x + (rng() * 2 - 1) * 20, cx - ampX, cx + ampX);
          ty = bounds.surfaceY + halfH;
          kind = 'surface';
          dart = false;
        } else if (!hungry && drives.hide <= 0.3 && pick < LAP_ODDS * (0.4 + activity)) {
          // A lap: four to seven legs round the middle of the bowl, one way.
          lapDir = rng() < 0.5 ? 1 : -1;
          lapAngle = Math.atan2((y - (yMin + yMax) / 2) / Math.max(1, (yMax - yMin) * LAP_RY), (x - cx) / Math.max(1, ampX * LAP_RX)) + lapDir * LAP_STEP;
          lapLegs = 3 + Math.floor(rng() * 4);
          tx = cx + Math.cos(lapAngle) * ampX * LAP_RX;
          ty = (yMin + yMax) / 2 + Math.sin(lapAngle) * (yMax - yMin) * LAP_RY;
          kind = 'lap';
          dart = false;
        } else if (!hungry && pick < (LAP_ODDS + FORAGE_ODDS) * (0.4 + activity)) {
          // Down to the gravel to pick at it.
          tx = clamp(x + n * 30, cx - ampX, cx + ampX);
          ty = bounds.floorY - halfH - 1;
          kind = 'forage';
          dart = false;
        } else if (!hungry && drives.hide > 0.3) {
          // Keep to the plant and the floor, by as much as the pet wants to hide.
          const h = hideSpot(bounds, halfH);
          const k = clamp(drives.hide, 0, 1) * 0.8;
          tx += (h.x - tx) * k;
          ty += (h.y - ty) * k;
          kind = 'hide';
        } else if (!hungry && attract) {
          // Bent toward something interesting, never flown straight to: the wander keeps running.
          const k = clamp(attract.strength * drives.approach, 0, 1) * ATTRACT_MAX;
          tx += (attract.x - tx) * k;
          ty += (clamp(attract.y, yMin, yMax) - ty) * k;
          kind = 'approach';
        }
        const length = Math.hypot(tx - x, ty - y);
        // The bow of the arc: a fraction of the leg, sign and size from the noise so no two legs match.
        const bulge =
          kind === 'surface' || kind === 'forage' ? 0 : kind === 'lap' ? lapDir * length * 0.2 : n * (hungry ? 0.12 : kind === 'follow' ? 0.15 : 0.3) * length;
        const legSpeed = dart ? DART_PEAK : cruise * (kind === 'follow' ? 1.1 : kind === 'lap' ? 0.95 : 0.85 + 0.3 * (n2 + 1) * 0.5);
        startLeg(tx, ty, legSpeed, kind, bulge, dart, bounds, halfW, halfH);
      }

      if (leg !== null) {
        // ---- swim the leg: speed with inertia (or a dart profile), position by distance along the arc
        if (leg.dartTick >= 0) {
          // A burst that bleeds into a swim: a greeting keeps going at cruise once the dash is spent,
          // a startle or a spontaneous dart stops short when it has bled out.
          const burst = dartSpeed(leg.dartTick, leg.speed, DART_TICKS);
          leg.dartTick += 1;
          if (leg.kind === 'greet') {
            speed = Math.max(burst, cruise);
          } else {
            speed = Math.max(burst, 0.4);
            if (leg.dartTick > DART_TICKS * 1.5) leg.dist = leg.arc.length; // spent: this is the last tick
          }
        } else {
          speed = approachSpeed(speed, leg.speed, SPEED_TUNING);
        }
        leg.dist += speed;
        const p = alongArc(leg.arc, leg.dist);
        nx = p.x;
        ny = p.y;
        if (leg.dist >= leg.arc.length) {
          const done = leg;
          leg = null;
          if (done.kind === 'surface') {
            surfaceHold = SURFACE_HOLD_TICKS;
          } else if (done.kind === 'forage') {
            forage = { phase: 'peck', ticks: -1, pecks: 2 + Math.floor(rng() * 2), hold: 12 + Math.floor(rng() * 9) };
          } else if (done.kind === 'lap' && lapLegs > 0) {
            // straight on into the next leg of the lap
          } else if (done.kind === 'follow') {
            pauseTicks = 3 + Math.floor((noise1(seed + 13, legCount * 0.41) + 1) * 3);
          } else {
            // Hang about for a bit, longer when there is nothing to do; a dart ends in a stop.
            const hang = (noise1(seed + 7, legCount * 0.37) + 1) * 0.5;
            pauseTicks = Math.round(hang * PAUSE_MAX_TICKS * (1.1 - activity) * pers.hang * (done.kind === 'startle' ? 0.6 : 1));
          }
        }
      }
      anim = hungry ? 'hungry' : celebrate > 0 ? 'excited' : 'idle';
      if (anim === 'idle' && act === 'gulp') anim = 'eat';
    }

    // ---- facing: flips only when the travel direction really has, once per change, holding position
    let turning = false;
    const vx = nx - prevX;
    const vy = ny - prevY;
    const travel = Math.hypot(vx, vy);
    if (wantFacing !== 0 && turnCooldown === 0 && wantFacing !== facing) {
      // food (or the viewer it is looking at) decides which way the face points, whichever way the
      // body happens to be drifting
      facing = wantFacing;
      turning = true;
      turnCooldown = TURN_COOLDOWN;
      nx = x;
      ny = y;
    } else if (wantFacing === 0 && !lockFacing && turnCooldown === 0 && travel > 0.05) {
      let want: 1 | -1 | 0 = 0;
      if (leg !== null) {
        const h = arcHeading(leg.arc, leg.dist);
        want = h.x > TURN_DEAD_ZONE ? 1 : h.x < -TURN_DEAD_ZONE ? -1 : 0;
      } else {
        const hx = vx / travel;
        want = hx > TURN_DEAD_ZONE ? 1 : hx < -TURN_DEAD_ZONE ? -1 : 0;
      }
      if (want !== 0 && want !== facing) {
        facing = want;
        turning = true;
        turnCooldown = TURN_COOLDOWN;
        nx = x;
        ny = y;
        if (leg !== null) leg.dist -= speed; // the held tick is not travelled
      }
    }

    const c = bounds.clamp(nx, ny, halfW, halfH);
    x = c.x;
    y = c.y;

    if (eatTicks > 0) anim = 'eat';
    return { x, y, facing, turning, anim, biteFlakeIndex: bite, ...(act !== undefined ? { act } : {}) };
  };

  return { step, reset };
}
