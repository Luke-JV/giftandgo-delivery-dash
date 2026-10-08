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
- Some route gifts are coloured: **blue** pays double, **green** refills the nitro tank, **purple** pays five times
  and **pink** pays double and adds a shield (you can hold one). They count towards the chain like any other gift.
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
  5, 10, 20, 30, 40, 50 and 60 consecutive gifts (×2 to ×8). Letting a guaranteed-lane gift go by or breaking a shield resets it to ×1. Coupon, shop and delivery rows do not break it. The multiplier glows hotter
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
  250 × the multiplier (shown above it on the road), and **SNAPPY** pops up on screen with the points it paid. Like a coupon, its row's gift doesn't count as a route gift,
  so taking Snappy never breaks the chain. It never appears with a shop, delivery or roadworks. `POWERPUP_BONUS`
  sets the value.
- **Giftasaurus.** Every 26–42 seconds at first, tightening to 16–28 by 10 minutes (first 30–45 seconds in, never with a shop, delivery, roadworks or the gift shower)
  a blue-striped bobblehead T-rex stands on one verge. With its feet planted it tilts in and swings its big head over
  the outer lane on that side, clamps its jaws, pulls back and rests, about 4 seconds a cycle (`BITE_CYCLE`). The jaws
  only bite while they are down on a truck in that lane (about 0.6–2.5s of each cycle); they never reach the middle
  lane, so the other two lanes are always a way through. That row's guaranteed gift sits under the jaws: grab it
  between bites to keep the chain, or skip it and lose the chain. Each bite is timed so the gift can be reached either
  at the normal pace or, when your tank has enough nitro, only by boosting. Shields, Ghost Truck and Holiday Gift
  Shoppe work on it like any other hazard. Art is in `assets/giftasaurus-*.png`.
- **Wrecking-ball crane.** Every 32–52 seconds at first, tightening to 20–34 by 10 minutes (first 40–60 seconds in, never with a
  shop, delivery, roadworks, coupon, Snappy, the gift shower or on the river crossing) an orange crawler crane stands on one
  verge with its boom reaching over the middle of the road. A wrecking ball hangs from the tip on a chain and rocks across all
  three lanes, from the centre of one edge lane to the centre of the other, once every 3.2 seconds (`CRANE_PERIOD`,
  `CRANE_REACH`), with a shadow on the road showing where it is. The ball hits a truck within about half a lane of it, so the
  truck can be hit anywhere on the road, but there is always at least one lane clear. The swing is timed so the ball is well
  clear of the route lane as the truck passes at the normal pace (`timeSwing`); the other two lanes are fair game, and boosting
  changes when the truck arrives, so a boost can put it under the ball. A crane never shares a row with a hazard, a delivery
  waits for it to pass, and shields, Ghost Truck and Holiday Gift Shoppe (which removes it) work on it as on any other hazard.
  Art is in `assets/crane.png` and `assets/wrecking-ball.png`.

## Tunnels and the river crossing

The road has two set pieces with their own hazards, instead of cones, barriers, drums and potholes. Both keep the
rule that the guaranteed route gift marks an open lane.

**Tunnels** first appear about 3 minutes in (170–200 seconds) and come every 45–90 seconds after that, 10 seconds long
at first and up to 18 by 10 minutes. A concrete portal in a hill leads into a dark tunnel with ceiling lamps and a bright
exit. Inside, hazards fade out beyond about 1.5 seconds of travel, while gifts, bays and coupons glow and stay visible to
about 2.6 seconds, so you can still read the route.
- **Stalled cars** join the usual obstacles rather than replacing them: about 3 in 10 side-lane obstacles are stalled cars, the rest are the normal cones, barriers, drums and potholes. They are dark, but their hazard lights flash amber and show through
  the dark before the car itself does.
- **Maintenance vehicle.** Once per tunnel, a work truck with a beacon and a chevron panel closes one or two lanes for
  3.5–5 seconds, like a short roadworks closure (no flip).
- **Lane-control gantry.** About 3 seconds before that closure an overhead gantry shows a red X over each lane that will
  be shut and a green arrow over the rest, and stays bright in the dark.

**The river crossing** (12 seconds, 24 seconds into every 80 second cycle) adds **birds** (a flock of gulls standing on
the road) and large **puddles** to the usual obstacles, about 3 in 10 of them (`ZONE_HAZARD_CHANCE`). Hitting either is a crash, like any other hazard: a shield
or Ghost Truck takes it. From 2.5 minutes in, one crosswind per crossing. About 3 seconds ahead a windsock on the rail starts to stream, streaks
blow across the road and a "Crosswind" chip appears. Then a bar fills outward from the middle toward the side the wind
will push you, over 1.3 seconds (`GUST_BUILD_SECONDS`), and the truck leans gradually toward that lane. Only when the bar is
full does your lane actually change, one lane toward the wind; the drawn truck carries on smoothly from its lean while
the hitbox jumps. Against the rail nothing moves, and you can steer yourself into the wind's lane early. Rows around the
gust are left clear of obstacles.
Both zones are placed by distance along the run (`bridgeSpan`, `planTunnel` in `delivery-dash.engine.ts`), a tunnel
never overlaps a crossing, and shops and delivery bays are never put on the bridge.

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
| Shield | 100 | Absorbs one collision; hold one at a time |
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

Speed increases continuously with active playing time: `107.5 + 300 × (1 − e^(−t/60)) + 0.75 × t` (`SPEED_START`, `SPEED_RISE`, `SPEED_CREEP`)
in game-world units, with no upper speed cap. The pace display starts at 1.0×,
reaches approximately 3.2× after one minute, 5.9× after five and 8× after ten, and continues rising slowly. The camera
widens its view gradually as speed rises so approaching obstacles remain readable.

Patterns alternate between single obstacles, two-lane roadwork rows, slalom
sequences, and clear gift-collection stretches. Clear stretches thin out from a 40% chance per pattern change
to 5%, and single-obstacle rows increasingly block both side lanes (10% of them, rising to 70% at 10 minutes). Each row leaves a free lane;
consecutive guaranteed routes usually move at most one lane. From 2 minutes in, an edge-lane
route increasingly jumps straight to the opposite edge (up to a 3 in 10 chance per row by 10 minutes), so the
truck has to cross the whole road. Gift boxes indicate that route. Changing one lane takes 0.16 seconds.

**Roadworks** close lanes for a long stretch (4–7 seconds of driving), roughly every
22–40 seconds after the previous one ends at first, tightening to 14–28 by 10 minutes (first from 30 seconds in). A closure shuts one edge lane, or, increasingly as the
run goes on, two lanes leaving only an edge lane open. A striped barrier with a flashing
chevron board marks the start, a warning sign stands on the verge, and cones line the
dug-up surface. Steering into a closed lane at any point along it is a crash (a shield
or Ghost Truck gets you through that lane for the rest of the closure; Gift Rain turns
closures still ahead into a trail of gifts). Rarely, a two-lane closure flips sides: far
left open, then a short clear gap, then far right open (or the reverse). Rows inside a
closure keep their route in an open lane, rows where a closure starts, ends or flips are
left clear, and shops, coupons and delivery requests wait until the road reopens.

New rows spawn 4.8 seconds ahead using the future acceleration curve. Arrival
spacing tightens from about 1.6 seconds down to 0.95 at five minutes and a 0.55 second floor from ten minutes on (`ROW_GAPS`), which leaves about 200ms for a two-lane jump, preserving time to
change lanes at higher speeds. Swept collision checks examine both the road
position and lane-change path across each frame, so faster objects cannot skip
through the collision area. Boosts are optional; safe routes do not require them.
Distance and pace are arcade measures, not a realistic driving simulation.

## Rendering and lifecycle

The game uses a 240-wide canvas displayed up to 480px, 230 tall when embedded. In
fullscreen the canvas grows taller (up to 560) to match the screen's aspect ratio, so
a portrait phone is filled edge to edge; very wide screens are pillarboxed. The truck sprite is
48×73 logical pixels and uses nearest-neighbour rendering. The original logo
is drawn as a separate high-resolution image so its lettering stays sharp.

All assets are embedded in `delivery-dash.assets.ts`; no HTTP client, CDN,
external fonts, animation library, or extra npm package is needed in your app.
`assets/` includes the truck, logo, original scenery and the tunnel and bridge sprites (generated with Codex, keyed from a flat background and downsampled to game scale) as separate PNG files for reuse; copying
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
