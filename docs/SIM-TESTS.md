# Sim test list (from the contract critique; implement first)

VITEST TEST LIST (src/sim/*.test.ts; B = 1_700_000_000_000, H = HOUR_MS, fresh = newPet(B, seededRng) with pantry 0, ledger = new LocalLedger(1000)).

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
6. feed cap: feed at hunger 100 -> ok, hungerAtLastFed 100, balance 975, meals 1, feedBurned 25, lastFedAt===lastReconciledAt===now.
7. feed at B+16.8H (hunger 30) -> 80; at B+24H (hunger 0) -> 50.
8. insufficient balance: ledger 24 -> {ok:false, reason:'insufficient-balance'}, balance still 24, state only reconciled.
9. dead -> {ok:false, reason:'dead'}, ledger untouched.
10. feed reconciles first: state lastReconciledAt=B, pantry 100, feed at B+48H -> events [auto-fed@16.8H, auto-fed@28.8H, auto-fed@40.8H], pantry 25, meals 4, hunger at 48H is 50 (80 at 40.8H minus 7.2 h of decay); assert hungerAtLastFed = min(100, hungerAt(afterAutoFeeds,48H)+50) = 100.

reconcile.test.ts
11. pantry auto-feed timing over 10-day gap with 1000: depositPantry(1000) at B then reconcile(B+240H): events are exactly 19 'auto-fed' with at = B+(16.8+12k)H k=0..18, hungerAfter closeTo 80 each, pantryAfter 975,950,...,525; no hungry/starving events; final pantry 525, meals 19, feedBurned 475, balance 0, alive, hungerAt(240H)=50. (500 also survives the ten days but ends on its last 25.)
12. death exactly at 12h-at-zero: pantry 0; reconcile(B+36H-1) -> alive, events [hungry@B+16.8H, starving@B+24H, dying-soon@B+30H diesAt B+36H]; reconcile(B+36H) -> alive false, diedAt=B+36H, events [died@B+36H]; hungerAt(dead)=0; reconcile(dead, B+200H) -> same state, [].
13. catch-up event list single shot: reconcile(fresh, B+36H) -> [hungry@16.8H, starving@24H, dying-soon@30H, died@36H] in that order with exact ats.
14. path independence: reconcile every 1H (and every 30 s over a 3-day window) from B to B+240H with pantry 500 produces the same concatenated event list and deep-equal final state as one reconcile at B+240H.
15. reconcile is idempotent: for t in [B+16.8H (auto-feed at boundary, pantry 25), B+24H (starving at boundary), B+36H, B+240H]: r1=reconcile(s,t); r2=reconcile(r1.state,t) -> r2.state toEqual r1.state and r2.events toEqual [].
16. events before from never re-emitted: reconcile to B+20H (gets hungry@16.8H) then to B+40H -> second list exactly [starving@24H, dying-soon@30H, died@36H].
17. once per cycle: pantry 25 -> auto-fed@16.8H (no hungry there), hungry@28.8H, starving@36H, dying-soon@42H, died@48H; exactly one hungry.
18. hungry not emitted at a fed crossing; hungry emitted when pantry 24 (< cost).
19. no retroactive feed: pantry 0, reconcile to B+20H; depositPantry(100) at B+20H -> moved 100, events [auto-fed@B+20H] (not 16.8H), hungerAfter closeTo 66.6667, pantry 75, balance 900; no second hungry.
20. deposit rescue: pantry 0, reconcile to B+28H (starving@24H); depositPantry(25) at B+28H -> auto-fed@28H, hungerAfter 50, alive; reconcile(B+38H) still alive, zeroAt=B+40H.
21. deposit too late: reconcile(B+36H) dead; depositPantry(500) -> moved 0, balance 1000, events [].
22. deposit below cost: depositPantry(10) at B+20H -> moved 10, no auto-fed, pantry 10.
23. hungerAtLastFed <= 30 (dev): state {hungerAtLastFed:20, lastFedAt:R, lastReconciledAt:R, pantry:25}; reconcile(R+1H) -> auto-fed at R (t* = from), hungerAfter 70.
24. alive-at-t* guard: state at zero since Z with pantry 25 injected by dev and lastReconciledAt past Z+12H; reconcile(Z+20H) -> died@Z+12H, no auto-fed, pantry still 25.
25. backwards clock: reconcile(s, s.lastReconciledAt-1H) -> state toEqual s, []; hungerAt(s, s.lastFedAt-1H) === s.hungerAtLastFed.
26. dead no-op: reconcile(dead, later) -> unchanged, []; depositPantry on dead -> moved 0.

pantry.test.ts / ledger.test.ts
27. LocalLedger: burn(25) -> 975; burn(1001) throws RangeError and balance unchanged; burn(-1), burn(1.5), burn(NaN) throw; debit(100)+credit(100) round-trips; toJSON()===balance.
28. no negative balances: depositPantry(2000) with balance 1000 -> moved 1000, balance 0, pantry 1000; depositPantry(-5) -> moved 0; depositPantry(12.7) -> moved 12; feed with balance 0 fails; pantry never < 0 after any auto-feed sequence (pantry 30 -> exactly one auto-feed, pantry 5).
29. withdrawPantry: moved === pantry, pantry 0, balance restored; withdraw on dead pet allowed and returns funds.
30. conservation invariant: seeded random sequence of 500 ops (feed/deposit/withdraw/reconcile with random dt) keeps balance + pantry + feedBurned === 1000 and every quantity >= 0 and integer.

newPet.test.ts / age.test.ts
31. newPet: id matches /^#\\d{4}$/ in #0001..#9999; lastReconciledAt===lastFedAt===bornAt; hungerAtLastFed 100; pantry 0; alive; 'diedAt' not in state; opts.name/species honoured; rarity over 10k seeded draws within 2 pts of 70/20/8/2; personality uniform within 3 pts.
32. ageMs/formatAge: 0 -> '0d 0h'; 3d4h -> '3d 4h'; 59 min -> '0d 0h'; dead pet age frozen at diedAt-bornAt (36H -> '1d 12h').
33. toGraveRecord: pet copied, diedAt from state, ageMs = diedAt-bornAt, buriedAt = now.

persistence.test.ts (migratePetDoc)
34. a version-1 pet keeps the hunger it was showing: computed with the OLD rate (100/60), re-anchored at now.
35. lastFedAt and lastReconciledAt both move to now, so reconcile(migrated, now) emits nothing -- this is what
    prevents a four-notification burst (hungry, starving, dying-soon, died) on the first tick after upgrading.
36. version stamped to 2; balance, latches and every other pet field byte-identical.
37. a document already at version 2 is returned by identity, so a no-op migration never marks the file dirty.
38. a dead pet is untouched beyond the version stamp.
39. a pet the OLD rules would already have starved is re-anchored at 0 and given the full new death window --
    an upgrade must never be the thing that ends a pet.
40. isPetDoc accepts versions 1 and 2 and rejects 0 and 3.

ui/labelSync.test.ts
41. hungerLabel (sim) and labelFor (ui) agree at every tenth of a point over 0..100, on both boundaries and
    either side of them, and on out-of-range values. The two are duplicated on purpose (src/ui must not import
    src/sim); this is the only thing stopping them drifting apart.
