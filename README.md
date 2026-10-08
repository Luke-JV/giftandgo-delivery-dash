# Gift&Go Delivery Dash — Angular 21

Three-lane pixel art driving game using the Gift&Go navy and orange palette.
An elevated rear view shows your original Gift&Go logo on the cargo doors.
Steer around detailed cones, barricades, traffic drums and potholes. Collect gift boxes
to earn gift points, spend them on upgrades at roadside shops, and grab the rare golden coupon for a free power-up. The
scenery reuses the original loading animation’s trees, layered hills and clouds.

## Use in Angular

Copy the eight files in `src/` into `src/app/shared/delivery-dash/`.
Import the standalone `DeliveryDashComponent` in your page's `imports`.

```ts
import { Component } from '@angular/core';
import { DeliveryDashComponent } from './shared/delivery-dash/delivery-dash.component';

@Component({
  selector: 'app-tracking-page',
  standalone: true,
  imports: [DeliveryDashComponent],
  template: `<app-delivery-dash [width]="480" (finished)="onFinished($event)" />`,
})
export class TrackingPageComponent {
  onFinished(result: { score: number; distance: number; gifts: number; giftPoints: number; coupons: number }): void {
    console.log('Run finished', result);
  }
}
```

Adjust the relative import for your page's location. The `finished` output is optional.
An NgModule-based page can import this standalone component in its NgModule.
The component is separate from the shipment loader; show it where appropriate
while waiting or as an optional game. Your existing shipment request and its
success/error handling determine when the loading area is removed.

| API | Description |
| --- | --- |
| `width` | Defaults to 480px. Sets the host width, with a minimum of 240px; CSS shrinks it to fit its parent. The inner game is capped at 480px. |
| `finished` | Emits `{ score, distance, gifts, giftPoints, coupons, spent, duration, maxMultiplier, deliveries, deliveriesMissed }` once when a run ends in a collision. Score and distance are rounded down to whole numbers (distance in metres). |

## Play

- Start using the **Start driving** button.
- Arrow Left/Right or A/D changes one lane per key press.
- The arrow buttons also work with mouse, touch, or keyboard.
- Hold ↑ or W (or the **BOOST** button on touch) to go 1.6× faster. The nitro meter drains in about
  3 seconds (up to 6 with shop upgrades) and recharges in about 8; once empty it must refill to 25% before it can be used again.
  Boosting gives rows less time to arrive, so steer carefully; it does not add score by itself, but it is how you
  beat a delivery clock (see below). On touch,
  hold BOOST with one thumb and steer with the arrows or by swiping with the other.
- On the road, tap its left or right half to change one lane, or swipe horizontally.
- **Pause**, P, or Escape freezes the game; **Resume drive** continues it.
- After a collision, **Drive again** resets the run.
- The personal best score is stored locally under `giftgo-delivery-dash-best-score`.
- Distances are stored in whole metres and shown in km from 1,000m (`formatDistance` in `delivery-dash.leaderboard.ts`).
  The game still works when local storage is blocked; the best then lasts only
  for the current component instance. There is no server score or leaderboard.

## Road trip

The road winds through the countryside with smooth left and right bends.
Lane markings, roadside scenery, obstacles and pickups all share the same
curved perspective. The camera stays anchored at the truck, and lane changes
retain the same timing and collision rules on a bend.

Bridge crossings appear ahead, with water, concrete edges and moving guardrail
posts. The first crossing is around 24–36 seconds of active driving, then returns
in later route cycles. Trees and verge details stop at the river banks. Bridges
retain all three lanes and do not add invisible collision boundaries.

## Score, multiplier and deliveries

Runs are ranked on **score**, not distance. Score only goes up (apart from the delivery penalty) and is
never spent; gift points are a separate wallet for shops.

- **Gifts** add their value (10, or 50 under Golden Hour) × the current multiplier.
- **Distance** trickles in at about 1 point per second at the start, rising gently with pace, also × the multiplier.
  Boosting does not speed it up.
- **Multiplier chain.** Every gift collected in the guaranteed lane extends the chain; the multiplier steps up at
  5, 10, 20, 30, 40, 50 and 60 consecutive gifts (×2 to ×8). Letting a guaranteed-lane gift go by (including to take a
  coupon) or breaking a shield resets it to ×1. Shop and delivery rows do not break it. The multiplier glows hotter
  with each tier, pops with a **×N STREAK!** call when it steps up, and flashes red with **×N LOST** when the streak breaks.
- **Deliveries.** Every 25–40 seconds (first around 30–35 seconds in, never on the river crossing or while a shop or coupon
  is due) a banner announces a delivery to the left or right lane. About 2.5 seconds later a green drop-off bay
  appears, and a clock starts that runs out about 0.6 seconds before an unboosted truck would arrive. Be in the
  bay's lane as you pass before the clock ends to score 100 × the multiplier and jump the chain up one tier.
  Run out of time or pass in the wrong lane and you lose a flat 50 points; the run and the chain carry on.
  Bays are never in the middle lane, and their rows have no hazards. The tuning constants are at the top of
  `delivery-dash.engine.ts` (`DELIVERY_*`, `MULTIPLIER_TIERS`).
- **Snappy powerpup.** Very rarely (first 35–65 seconds in, then every 50–90 seconds) the blue Snappy mascot
  stands in a lane beside the guaranteed gift lane, glowing and circled by message icons. Drive into it for
  250 × the multiplier (shown above it on the road), and **SNAPPY** pops up on screen with the points it paid. Like a coupon, taking it means passing up that row's
  route gift, so it resets the chain. It never appears with a shop, delivery or roadworks. `POWERPUP_BONUS`
  sets the value.
- **Giftasaurus.** Every 40–65 seconds (first 45–65 seconds in, never with a shop, delivery, roadworks or the gift shower)
  a blue-striped bobblehead T-rex stands on one verge. With its feet planted it tilts in and swings its big head over
  the outer lane on that side, clamps its jaws, pulls back and rests, about 4 seconds a cycle (`BITE_CYCLE`). The jaws
  only bite while they are down on a truck in that lane (about 0.85–2.25s of each cycle); they never reach the middle
  lane, so the other two lanes are always a way through. That row's guaranteed gift sits under the jaws: grab it
  between bites to keep the chain, or skip it and lose the chain. Each bite is timed so the gift can be reached either
  at the normal pace or, when your tank has enough nitro, only by boosting. Shields, Ghost Truck and Holiday Gift
  Shoppe work on it like any other hazard. Art is in `assets/giftasaurus-*.png`.

## Gift points, coupons and shops

Each collected gift earns **10 gift points**. Gift points are a balance you spend at roadside shops.
Coupons and shops never offer the same thing: coupons are free, short-lived power moments, while
the shop sells upgrades that last for the rest of the run.

**Golden coupons** are rare (roughly every 30–50 seconds of driving). A coupon sits in a lane
beside the guaranteed gift lane, so you choose between the safe gift and the coupon. Collecting
it pauses the run with a **COUPON** menu offering all three free power-ups, each labelled "Redeem …".

| Coupon | Effect |
| --- | --- |
| Ghost Truck | Drive straight through hazards for 7s |
| Jackpot | Every gift is worth 50 points for 10s |
| Holiday Gift Shoppe | Every hazard ahead turns into a gift, and new rows are all gifts for 4s |

**Roadside shops** appear every 45–70 seconds on the left or right verge, marked by an overhead
SHOP sign and an orange bay on the road. Be in that lane as you pass and the run pauses at the
shop. Shop rows have no hazards. Missing the lane means missing the shop.

| Shop item | Cost | Effect |
| --- | --- | --- |
| Shield | 100 | Absorbs one collision; hold up to three |
| Bigger Nitro Tank | 150 / 300 / 450 | +1s of boost per level (3s → 6s) and refills the tank |
| Loyalty Card | 120 / 240 / 360 | +5 points per gift per level (10 → 25) |
| Black & Decker Dustbuster | 300 | Hoovers up gifts one lane over for 60s: from the middle lane it reaches all three, from an edge lane the middle one too. Buy it again once it runs out |
| Freeplay | All gift points (min 10) | Converts your whole balance to score at your current multiplier |

Levelled items show their current level and the next price; fully bought items show MAX. Freeplay
shows the score it would add, so cashing in on a long gift chain pays more.
Jackpot sets gifts to a flat 50 points, overriding the Loyalty Card while it lasts.
Run gift points, upgrades and timers reset when starting a new run. These are game-only
rewards: no real loyalty balance or coupon-store API is called.

## Leaderboard

The start, pause and game-over screens have a **Leaderboard** button that opens the board. It loads
`BOARD_PAGE_SIZE` (25) rows at a time as you scroll, and the search box filters by name while keeping each
run's overall rank. Your own entry is highlighted and scrolled into view. It has two tabs:

- **v0.2 · Score** (default) ranks runs by score. Runs of `MIN_SUBMIT_SCORE` (100) or more can be
  submitted from the game-over screen with a 2–16 character nickname; the board then opens with your rank.
- **v0.1 · Hall of Fame** is the original distance board, frozen and read-only.

Scores live in Supabase. Project URL and the public anon key are constants at the top of
`delivery-dash.leaderboard.ts`. If the network call fails the game still works.

### Setting up the backend

Run these in the Supabase SQL editor, in order. Both are safe to run again.

1. `supabase/profanity-filter.sql` installs the name filter (`is_clean_name`).
2. Export `public.scores` as CSV from the Table Editor and commit it as `supabase/archive/leaderboard-v0.1.csv`.
3. `supabase/leaderboard-v0.2.sql`:
   - freezes v0.1: `scores` stays where it is (builds already deployed keep reading it) but a trigger rejects any
     insert, update, delete or truncate, `submit_score` now raises "leaderboard v0.1 is closed", and a copy is kept in
     `scores_v01_archive`. To edit it anyway, disable trigger `scores_v01_frozen_rows` first;
   - creates `scores_v02` (read-only to the public via RLS) and `submit_score_v02`, the only way to write to it.
4. `supabase/leaderboard-search.sql` adds the `scores_v02_ranked` and `scores_ranked` views that search reads.
   Until it is run, scrolling works but searching shows "Couldn't load the leaderboard."

`submit_score_v02` rejects profanity, and distances, gift counts, points, deliveries and scores that are
impossible for the run's duration. The score ceiling is 8× the gift points earned, plus the pace trickle at ×8,
plus 800 for every delivery the clock allows; perfect-play bot runs reach 55–85% of it. If you change the scoring
rules in the engine, change this ceiling in the same commit. Remove unwanted v0.2 entries in the Supabase table editor.

## Interface

During a run a score pill (with the multiplier and a bar showing progress to the next step) and a gift-points
pill sit over the road, with short chips for active boosts and a delivery banner when one is on, plus pause
and fullscreen in the header and ← BOOST → underneath. Controls help, best score and the leaderboard live on
the start screen.

## Fullscreen

The expand button in the header fills the screen. It uses the Fullscreen API where available
and falls back to a fixed full-viewport layout (for example on iPhone Safari). Escape or the
same button exits.

## Difficulty and fairness

Speed increases continuously with active playing time: `86 + 2.4 × seconds`
in game-world units, with no upper speed cap. The pace display starts at 1.0×,
reaches approximately 2.7× after one minute, and continues rising. The camera
widens its view gradually as speed rises so approaching obstacles remain readable.

Patterns alternate between single obstacles, two-lane roadwork rows, slalom
sequences, and clear gift-collection stretches. Each row leaves a free lane;
consecutive guaranteed routes move at most one lane. Gift boxes indicate that
route. Changing one lane takes 0.16 seconds.

**Roadworks** close lanes for a long stretch (4–7 seconds of driving), roughly every
25–40 seconds from 30 seconds in. A closure shuts one edge lane, or, increasingly as the
run goes on, two lanes leaving only an edge lane open. A striped barrier with a flashing
chevron board marks the start, a warning sign stands on the verge, and cones line the
dug-up surface. Steering into a closed lane at any point along it is a crash (a shield
or Ghost Truck gets you through that lane for the rest of the closure; Gift Rain turns
closures still ahead into a trail of gifts). Rarely, a two-lane closure flips sides: far
left open, then a short clear gap, then far right open (or the reverse). Rows inside a
closure keep their route in an open lane, rows where a closure starts, ends or flips are
left clear, and shops, coupons and delivery requests wait until the road reopens.

New rows spawn 4.8 seconds ahead using the future acceleration curve. Arrival
spacing tightens from about 1.8 seconds toward 0.8 seconds, preserving time to
change lanes at higher speeds. Swept collision checks examine both the road
position and lane-change path across each frame, so faster objects cannot skip
through the collision area. Boosts are optional; safe routes do not require them.
Distance and pace are arcade measures, not a realistic driving simulation.

## Rendering and lifecycle

The game uses a 240×230 canvas displayed up to 480×460px. The truck sprite is
48×73 logical pixels and uses nearest-neighbour rendering. The original logo
is drawn as a separate high-resolution image so its lettering stays sharp.

All assets are embedded in `delivery-dash.assets.ts`; no HTTP client, CDN,
external fonts, animation library, or extra npm package is needed in your app.
`assets/` includes the truck, logo and original scenery as separate PNG files for reuse; copying
that directory is optional. If your site uses CSP, `img-src` must permit `data:`.

The renderer starts in `afterNextRender` and runs outside Angular change detection.
Browser APIs are not accessed during SSR. The component works with OnPush and
zoneless Angular. Game-over output delivery runs back inside Angular's zone.

Leaving the viewport, hiding the tab, or collapsing the game pauses a run.
Returning requires explicit resume so the player has time to react. Destroying
the component cancels its frame, disconnects observers, and removes listeners.

Reduced motion gives a static start screen and suppresses decorative bounce and
exhaust. The road and obstacles move after the player explicitly starts the game,
since their movement is necessary to play. The game has no audio.

## Preview and validation

Open `index.html` (or `preview.html`, an identical copy) directly in a browser. Run `TYPESCRIPT_PATH=<node_modules dir> node scripts/build-preview.mjs` to regenerate both from `src/`. It embeds the same game source and
assets as the component, with no server or installation required.
See `VALIDATION.md` for compilation, gameplay and browser checks.
