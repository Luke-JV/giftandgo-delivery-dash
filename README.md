# Gift&Go Delivery Dash — Angular 21

Three-lane pixel art driving game using the Gift&Go navy and orange palette.
An elevated rear view shows your original Gift&Go logo on the cargo doors.
Steer around detailed cones, barricades, traffic drums and potholes. Collect gift boxes
to earn gift points, spend them at roadside shops, and grab the rare golden coupon for a free boost. The
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
  onFinished(result: { distance: number; gifts: number; giftPoints: number; coupons: number }): void {
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
| `finished` | Emits `{ distance, gifts, giftPoints, coupons }` once when a run ends in a collision. Distance is rounded down to whole metres. |

## Play

- Start using the **Start driving** button.
- Arrow Left/Right or A/D changes one lane per key press.
- The arrow buttons also work with mouse, touch, or keyboard.
- Hold ↑ or W (or the **BOOST** button on touch) to go 1.6× faster. The nitro meter drains in about
  3 seconds and recharges in about 8; once empty it must refill to 25% before it can be used again.
  Boosting raises distance quickly but gives rows less time to arrive, so steer carefully. On touch,
  hold BOOST with one thumb and steer with the arrows or by swiping with the other.
- On the road, tap its left or right half to change one lane, or swipe horizontally.
- **Pause**, P, or Escape freezes the game; **Resume drive** continues it.
- After a collision, **Drive again** resets the run.
- The personal best distance is stored locally under `giftgo-delivery-dash-best`.
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

## Gift points, coupons and shops

Each collected gift earns **10 gift points**. Gift points are a balance you spend at roadside shops.

**Golden coupons** are rare (roughly every 30–50 seconds of driving). A coupon sits in a lane
beside the guaranteed gift lane, so you choose between the safe gift and the coupon. Collecting
it pauses the run with a **COUPON** menu offering three different boosts from a pool of eight,
each labelled "Redeem …". An offer avoids repeating the previous coupon's set.

| Boost | Effect |
| --- | --- |
| Shield | Absorbs one collision; hold up to three |
| Magnet | Collects gifts from neighbouring lanes for 25s |
| Double Points | Gifts are worth 20 points for 25s |
| Jackpot | Gifts are worth 50 points for 10s |
| Ghost Truck | Drive straight through hazards for 7s |
| Road Sweeper | Instantly clears every hazard ahead |
| Gift Shower | Instantly bank 100 gift points |
| Mystery Box | A random boost from the others |

**Roadside shops** appear every 45–70 seconds on the left or right verge, marked by an overhead
SHOP sign and an orange bay on the road. Be in that lane as you pass and the run pauses at the
shop, where you can buy Shield (100), Magnet (150), Ghost Truck (200) and Road Sweeper (250)
with gift points. Shop rows have no hazards. Missing the lane means missing the shop.
Run gift points, boosts and timers reset when starting a new run. These are game-only
rewards: no real loyalty balance or coupon-store API is called.

## Leaderboard

Runs of 20m or more can be submitted with a 2–16 character nickname once the run ends. The
start and game-over screens show the top five by distance. Scores live in Supabase
(`scores` table, read-only to the public via RLS) and are written only through the
`submit_score` function, which rejects distances, gift counts and points that are impossible
for the run's duration. Project URL and the public anon key are constants at the top of
`delivery-dash.leaderboard.ts`. If the network call fails the game still works. Remove
unwanted entries in the Supabase table editor.

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
