# Gift&Go Delivery Dash — Angular 21

Three-lane pixel art driving game using the Gift&Go navy and orange palette.
An elevated rear view shows your original Gift&Go logo on the cargo doors.
Steer around detailed cones, barricades, traffic drums and potholes. Collect gift boxes
to earn gift points, redeem coupons for boosts, and keep the delivery going. The
scenery reuses the original loading animation’s trees, layered hills and clouds.

## Use in Angular

Copy the six files in `src/` into `src/app/shared/delivery-dash/`.
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

## Gift points and coupons

Each collected gift earns **10 gift points**. Every **100 gift points** grants a
coupon: the run pauses with **Coupon acquired** and **Pick your gift**.

- **Delivery shield:** absorbs one collision. Hold up to three; brief protection
  after a hit prevents one obstacle row consuming several shields.
- **Gift magnet:** collects gifts from your lane and adjacent lanes for 25 seconds.
- **Double gift points:** gifts award 20 points for 25 seconds.

Timed rewards can be extended by choosing them again. Their timers, the road,
and acceleration all freeze while choosing a reward or pausing. Redeeming a
coupon grants 0.4 seconds of protection while the player returns to the road.
Gift points are earned, not spent, when redeeming these milestone coupons.
Run gift points, gifts, coupons and boosts reset when starting a new run.
These are game-only rewards: no real loyalty balance or coupon-store API is called.

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

Open `preview.html` directly in a browser. It embeds the same game source and
assets as the component, with no server or installation required.
See `VALIDATION.md` for compilation, gameplay and browser checks.
