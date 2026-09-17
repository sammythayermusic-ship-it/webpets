# Sim test list (from the contract critique; implement first)

VITEST TEST LIST (src/sim/*.test.ts; B = 1_700_000_000_000, H = HOUR_MS, fresh = newPet(B, seededRng) with pantry 0, ledger = new LocalLedger(1000)):

hunger.test.ts
1. decay math: hungerAt(fresh,B)=100; B+30H -> 50; B+42H -> 30; B+60H -> 0; B+90H -> 0 (clamped); B-1H -> 100 (never above hungerAtLastFed).
2. hungerLabel boundaries: 100,60.01 -> full; 60,30.01 -> peckish; 30,0.01 -> hungry; 0 -> starving.
3. zeroAt(fresh)=B+60H; after manual feed at B+50H hungerAtLastFed toBeCloseTo 61.6667 and zeroAt = B+87H; zeroAt(dead)=diedAt-24H.
4. projectedDeathAt: pantry 0 -> B+84H; pantry 24 -> B+84H; pantry 500 -> B+624H (20 feeds, last at 555H, zero 600H); dead -> diedAt.
5. pantryDays: 500 -> 22.5; 475 -> 21.375; 0 -> 0; 44 -> <2 and 45 -> >=2.

feed.test.ts
6. feed cap: feed at hunger 100 -> ok, hungerAtLastFed 100, balance 975, meals 1, feedBurned 25, lastFedAt===lastReconciledAt===now.
7. feed at B+42H (hunger 30) -> 75; at B+60H (hunger 0) -> 45.
8. insufficient balance: ledger 24 -> {ok:false, reason:'insufficient-balance'}, balance still 24, state only reconciled.
9. dead -> {ok:false, reason:'dead'}, ledger untouched.
10. feed reconciles first: state lastReconciledAt=B, pantry 100, feed at B+100H -> events [auto-fed@42H, auto-fed@69H, auto-fed@96H], pantry 25, meals 4, hungerAtLastFed closeTo 68.333 (hunger at 100H is 75-4*1.667+... computed from last auto-feed at 96H: 75-6.667=68.333, +45 capped -> 100? assert = min(100, hungerAt(afterAutoFeeds,100H)+45)).

reconcile.test.ts
11. pantry auto-feed timing over 10-day gap with 500: depositPantry(500) at B then reconcile(B+240H): events are exactly 8 'auto-fed' with at = B+(42+27k)H k=0..7, hungerAfter closeTo 75 each, pantryAfter 475,450,...,300; no hungry/starving events; final pantry 300, meals 8, feedBurned 200, balance 500, alive, hungerAt(240H)=60.
12. death exactly at 24h-at-zero: pantry 0; reconcile(B+84H-1) -> alive, events [hungry@B+42H, starving@B+60H, dying-soon@B+78H diesAt B+84H]; reconcile(B+84H) -> alive false, diedAt=B+84H, events [died@B+84H]; hungerAt(dead)=0; reconcile(dead, B+200H) -> same state, [].
13. catch-up event list single shot: reconcile(fresh, B+84H) -> [hungry@42H, starving@60H, dying-soon@78H, died@84H] in that order with exact ats.
14. path independence: reconcile every 1H (and every 30 s over a 3-day window) from B to B+240H with pantry 500 produces the same concatenated event list and deep-equal final state as one reconcile at B+240H.
15. reconcile is idempotent: for t in [B+42H (auto-feed at boundary, pantry 25), B+60H (starving at boundary), B+84H, B+240H]: r1=reconcile(s,t); r2=reconcile(r1.state,t) -> r2.state toEqual r1.state and r2.events toEqual [].
16. events before from never re-emitted: reconcile to B+50H (gets hungry@42H) then to B+90H -> second list exactly [starving@60H, dying-soon@78H, died@84H].
17. once per cycle: pantry 25 -> auto-fed@42H (no hungry there), hungry@69H, starving@87H, dying-soon@105H, died@111H; exactly one hungry.
18. hungry not emitted at a fed crossing; hungry emitted when pantry 24 (< cost).
19. no retroactive feed: pantry 0, reconcile to B+50H; depositPantry(100) at B+50H -> moved 100, events [auto-fed@B+50H] (not 42H), hungerAfter closeTo 61.6667, pantry 75, balance 900; no second hungry.
20. deposit rescue: pantry 0, reconcile to B+70H (starving@60H); depositPantry(25) at B+70H -> auto-fed@70H, hungerAfter 45, alive; reconcile(B+100H) still alive, zeroAt=B+97H.
21. deposit too late: reconcile(B+84H) dead; depositPantry(500) -> moved 0, balance 1000, events [].
22. deposit below cost: depositPantry(10) at B+50H -> moved 10, no auto-fed, pantry 10.
23. hungerAtLastFed <= 30 (dev): state {hungerAtLastFed:20, lastFedAt:R, lastReconciledAt:R, pantry:25}; reconcile(R+1H) -> auto-fed at R (t* = from), hungerAfter 65.
24. alive-at-t* guard: state at zero since Z with pantry 25 injected by dev and lastReconciledAt < Z+24H; reconcile(Z+30H) -> died@Z+24H, no auto-fed, pantry still 25.
25. backwards clock: reconcile(s, s.lastReconciledAt-1H) -> state toEqual s, []; hungerAt(s, s.lastFedAt-1H) === s.hungerAtLastFed.
26. dead no-op: reconcile(dead, later) -> unchanged, []; depositPantry on dead -> moved 0.

pantry.test.ts / ledger.test.ts
27. LocalLedger: burn(25) -> 975; burn(1001) throws RangeError and balance unchanged; burn(-1), burn(1.5), burn(NaN) throw; debit(100)+credit(100) round-trips; toJSON()===balance.
28. no negative balances: depositPantry(2000) with balance 1000 -> moved 1000, balance 0, pantry 1000; depositPantry(-5) -> moved 0; depositPantry(12.7) -> moved 12; feed with balance 0 fails; pantry never < 0 after any auto-feed sequence (pantry 30 -> exactly one auto-feed, pantry 5).
29. withdrawPantry: moved === pantry, pantry 0, balance restored; withdraw on dead pet allowed and returns funds.
30. conservation invariant: seeded random sequence of 500 ops (feed/deposit/withdraw/reconcile with random dt) keeps balance + pantry + feedBurned === 1000 and every quantity >= 0 and integer.

newPet.test.ts / age.test.ts
31. newPet: id matches /^#\\d{4}$/ in #0001..#9999; lastReconciledAt===lastFedAt===bornAt; hungerAtLastFed 100; pantry 0; alive; 'diedAt' not in state; opts.name/species honoured; rarity over 10k seeded draws within 2 pts of 70/20/8/2; personality uniform within 3 pts.
32. ageMs/formatAge: 0 -> '0d 0h'; 3d4h -> '3d 4h'; 59 min -> '0d 0h'; dead pet age frozen at diedAt-bornAt.
33. toGraveRecord: pet copied, diedAt from state, ageMs = diedAt-bornAt, buriedAt = now.
