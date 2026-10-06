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

Your actual Angular application’s build, CSP, global CSS and loading flow still
need integration checks. The prototype does not call a loyalty or coupon-store
API. Gift points and coupons are per-run game rewards.
