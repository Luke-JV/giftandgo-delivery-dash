# Validation

Angular 21.0.0 / TypeScript 5.9.3 strict compilation passed, including templates,
injection parameters and input checking.

The simulation checks cover lane bounds and transition timing, pause/resume,
gift collection, collision, restart, capped frame gaps and successful dodging.
A seeded 1,000-second simulation followed 1,221 generated rows across all four
obstacle types with continuous acceleration. It selected only points rewards,
with redemption protection disabled, to verify that safe routes need no shield
or magnet. Every checked route stayed reachable and speed continued increasing.

Reward checks cover gift points, coupon thresholds, frozen reward-choice time,
double points, adjacent-lane magnet collection and shield consumption. A swept
collision test at an extreme speed verifies that obstacles cannot cross the
whole collision area undetected in one frame.

Headless Chromium checks cover keyboard and touch steering, pause/resume,
collision/restart, reduced motion, teardown, 320px sizing, coupon-choice focus,
all three reward effects and mobile reward layout. Additional browser checks cover left/right curves, the fixed truck camera and
bridge crossings. Desktop and mobile screenshots were inspected for the rear
logo, scenery, obstacle readability, bridge rails and reward menu.

Slot machine checks: a seeded run of 40 autopiloted 15-minute games saw 411 slot
spawns (about one per 88s), none before 25s or within 30s of another. Each outcome
applied its payout at the multiplier locked in at pickup, settled once at 1.6s, and
a loss never took score below zero. In the browser the side panel stayed over the
verge on either side of the road, the truck kept driving during the spin, and the
jackpot, loss and reduced-motion paths drew without console errors.

Your actual Angular application’s build, CSP, global CSS and loading flow still
need integration checks. The prototype does not call a loyalty or coupon-store
API. Gift points and coupons are per-run game rewards.

Difficulty checks (speed 86 + 240(1 − e^(−t/60)) + 0.6t, row gaps from 1.6s down to a 0.55s floor at 10 minutes, route
jumps, more frequent roadworks and Giftasaurus, one shield at a time). Seeded autopiloted 900-second runs, 40 per
setting, that follow the guaranteed route and wait for each row to clear plus a fixed delay before changing lane
(Giftasaurus bites ignored, since the bot boosts more crudely than a player). The delay is the wait between a row
clearing and the lane change, not a reaction to a surprise, since rows are visible about 5 seconds ahead.
- 0.3s delay: no crash in the first 5 minutes; all crashed in the 5–10 minute band.
- 0.25s delay: no crash in the first 5 minutes; all crashed by 15 minutes, roughly half of them between 5 and 10.
- 0.2s delay (the design ceiling: an impressive human): no crash in the first 5 minutes; 7 of 40 reached 15 minutes.
- 0.15s delay: no crash in the first 5 minutes; 9 of 40 reached 15 minutes.
Roadworks never crashed the bot at these delays. The score and distance ceilings in
`supabase/leaderboard-v0.2.sql` follow the new speed curve and row-gap floor and must be re-run before deploy.
