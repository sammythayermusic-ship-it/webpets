# Sim test list (from the contract critique; implement first)

VITEST TEST LIST (src/sim/*.test.ts; B = 1_700_000_000_000, H = HOUR_MS, fresh = newPet(B, seededRng) with pantry 0).

Food is free. A meal is MEAL_SIZE (25) of food: an auto-feed takes it from the pantry (the holiday feeder), and every
meal, manual or automatic, adds it to foodEaten. fillPantry fills the feeder to PANTRY_CAPACITY (150, three days).

The pet eats **twice a day**: a 50-point meal against a 24-hour bar, so one meal buys exactly 12 h and the
auto-feed cycle (30 -> 80) is the same 12 h. Landmarks from full: peckish 9.6 h, hungry 16.8 h, starving
24 h, dead 36 h. These numbers replaced a 45-point meal on a 60-hour bar (27 h cycle, death at 84 h).

hunger.test.ts
1. decay math: hungerAt(fresh,B)=100; B+6H -> 75; B+12H -> 50; B+16.8H -> 30; B+24H -> 0; B+90H -> 0 (clamped); B-1H -> 100 (never above hungerAtLastFed).
2. hungerLabel boundaries: 100,60.01 -> full; 60,30.01 -> peckish; 30,0.01 -> hungry; 0 -> starving.
3. zeroAt(fresh)=B+24H; after manual feed at B+18H (hunger 25) hungerAtLastFed 75 and zeroAt = B+36H; zeroAt(dead)=diedAt-12H.
4. projectedDeathAt: pantry 0 -> B+36H; pantry 24 -> B+36H; pantry 500 -> B+276H (20 feeds, last at 244.8H, zero 264H); dead -> diedAt.
5. pantryDays: 500 -> 10; 475 -> 9.5; 0 -> 0; 99 -> <2 and 100 -> >=2 (a day costs two 25-point meals, so days = pantry/50).

feed.test.ts
6. feed cap: feed at hunger 100 -> ok, hungerAtLastFed 100, meals 1, foodEaten 25, pantry untouched, lastFedAt===lastReconciledAt===now.
7. feed at B+16.8H (hunger 30) -> 80; at B+24H (hunger 0) -> 50.
8. feeding is free: 40 feeds in a row all ok, meals 40, foodEaten 1000, pantry untouched.
9. dead -> {ok:false, reason:'dead'} ('dead' is the only FeedFailure), state returned as is.
10. feed reconciles first: state lastReconciledAt=B, pantry 100, feed at B+48H -> events [auto-fed@16.8H, auto-fed@28.8H, auto-fed@40.8H], pantry 25, meals 4, foodEaten 100, hunger at 48H is 50 (80 at 40.8H minus 7.2 h of decay); assert hungerAtLastFed = min(100, hungerAt(afterAutoFeeds,48H)+50) = 100.

reconcile.test.ts
11. pantry auto-feed timing over 10-day gap with 1000 (a dev-set pantry): reconcile({...fresh, pantry: 1000}, B+240H): events are exactly 19 'auto-fed' with at = B+(16.8+12k)H k=0..18, hungerAfter closeTo 80 each, pantryAfter 975,950,...,525; no hungry/starving events; final pantry 525, meals 19, foodEaten 475, alive, hungerAt(240H)=50. (500 also survives the ten days but ends on its last meal.)
12. death exactly at 12h-at-zero: pantry 0; reconcile(B+36H-1) -> alive, events [hungry@B+16.8H, starving@B+24H, dying-soon@B+30H diesAt B+36H]; reconcile(B+36H) -> alive false, diedAt=B+36H, events [died@B+36H]; hungerAt(dead)=0; reconcile(dead, B+200H) -> same state, [].
13. catch-up event list single shot: reconcile(fresh, B+36H) -> [hungry@16.8H, starving@24H, dying-soon@30H, died@36H] in that order with exact ats.
14. path independence: reconcile every 1H (and every 30 s over a 3-day window) from B to B+240H with pantry 500 produces the same concatenated event list and deep-equal final state as one reconcile at B+240H.
15. reconcile is idempotent: for t in [B+16.8H (auto-feed at boundary, pantry 25), B+24H (starving at boundary), B+36H, B+240H]: r1=reconcile(s,t); r2=reconcile(r1.state,t) -> r2.state toEqual r1.state and r2.events toEqual [].
16. events before from never re-emitted: reconcile to B+20H (gets hungry@16.8H) then to B+40H -> second list exactly [starving@24H, dying-soon@30H, died@36H].
17. once per cycle: pantry 25 -> auto-fed@16.8H (no hungry there), hungry@28.8H, starving@36H, dying-soon@42H, died@48H; exactly one hungry.
18. hungry not emitted at a fed crossing; hungry emitted when pantry 24 (less than a meal).
19. no retroactive feed: pantry 0, reconcile to B+20H; fillPantry at B+20H -> events [auto-fed@B+20H] (not 16.8H), hungerAfter closeTo 66.6667, pantry 125; no second hungry.
20. fill rescue: pantry 0, reconcile to B+28H (starving@24H); fillPantry at B+28H -> auto-fed@28H, pantryAfter 125, hungerAfter 50, alive; reconcile(B+38H) still alive, zeroAt=B+40H.
21. fill too late: reconcile(B+36H) dead; fillPantry -> same state object, pantry 0, events [].
22. fill tops up: pantry 50 -> 150, no auto-fed at hunger 100; a dev-overfilled pantry 1000 stays 1000.
23. hungerAtLastFed <= 30 (dev): state {hungerAtLastFed:20, lastFedAt:R, lastReconciledAt:R, pantry:25}; reconcile(R+1H) -> auto-fed at R (t* = from), hungerAfter 70.
24. alive-at-t* guard: state at zero since Z with pantry 25 injected by dev and lastReconciledAt past Z+12H; reconcile(Z+20H) -> died@Z+12H, no auto-fed, pantry still 25.
25. backwards clock: reconcile(s, s.lastReconciledAt-1H) -> state toEqual s, []; hungerAt(s, s.lastFedAt-1H) === s.hungerAtLastFed.
26. dead no-op: reconcile(dead, later) -> unchanged, []; fillPantry on dead -> same state object, [].

pantry.test.ts (the holiday feeder)
27. fillPantry: PANTRY_CAPACITY is 150 (a multiple of MEAL_SIZE), pantryDays(150) = 3, PANTRY_LOW_DAYS = 1; filling a fresh pet sets pantry 150, emits nothing, leaves meals/foodEaten/lastFedAt alone, lastReconciledAt = now; filling again is harmless.
28. a full feeder over three days away: reconcile(fill(fresh), B+72H) -> 5 auto-feeds at 16.8, 28.8, ..., 64.8H, pantry 25, alive, hunger 50; on to B+108H -> [auto-fed@76.8H, hungry@88.8H, starving@96H, dying-soon@102H, died@108H], meals 6, foodEaten 150.
29. backwards clock and death: fill a pet reconciled to B+20H at now=B -> auto-fed@B+20H, pantry 125, lastReconciledAt B+20H; a dead pet comes back as the same object; a pet that dies in the catch-up is returned dead and unfilled.
30. invariants: seeded random sequence of 500 ops (feed/fill/reconcile with random dt, a dead pet sometimes replaced) keeps foodEaten === meals * MEAL_SIZE, 0 <= pantry <= PANTRY_CAPACITY, every count a non-negative integer, lastReconciledAt >= lastFedAt, and feed ok exactly when the pet is alive.

newPet.test.ts / age.test.ts
31. newPet: id matches /^#\\d{4}$/ in #0001..#9999; lastReconciledAt===lastFedAt===bornAt; hungerAtLastFed 100; pantry 0; alive; 'diedAt' not in state; opts.name/species honoured; rarity over 10k seeded draws within 2 pts of 70/20/8/2; personality uniform within 3 pts.
32. ageMs/formatAge: 0 -> '0d 0h'; 3d4h -> '3d 4h'; 59 min -> '0d 0h'; dead pet age frozen at diedAt-bornAt (36H -> '1d 12h').
33. toGraveRecord: pet copied, diedAt from state, ageMs = diedAt-bornAt, buriedAt = now.

persistence.test.ts (migratePetDoc)
34. a version-1 pet keeps the hunger it was showing: computed with the OLD rate (100/60), re-anchored at now.
35. lastFedAt and lastReconciledAt both move to now, so reconcile(migrated, now) emits nothing -- this is what
    prevents a four-notification burst (hungry, starving, dying-soon, died) on the first tick after upgrading.
36. version stamped to 3; latches and every other pet field byte-identical, bar the free-food rename.
37. a document already at version 3 is returned by identity, so a no-op migration never marks the file dirty.
38. a dead pet is untouched beyond the version stamp and the rename.
39. a pet the OLD rules would already have starved is re-anchored at 0 and given the full new death window --
    an upgrade must never be the thing that ends a pet.
40. isStoredPetDoc accepts versions 1 and 2 (legacy shape) and 3 (current shape), and rejects 0, 4 and mixed shapes.
40a. version 2 -> 3 (free food): the balance is dropped, feedBurned becomes foodEaten, the fourth personality becomes
    hyper; the hunger anchor, feeder, latches and needs are kept; graveyard.json version 1 records are upgraded, not dropped.

ui/labelSync.test.ts
41. hungerLabel (sim) and labelFor (ui) agree at every tenth of a point over 0..100, on both boundaries and
    either side of them, and on out-of-range values. The two are duplicated on purpose (src/ui must not import
    src/sim); this is the only thing stopping them drifting apart.
