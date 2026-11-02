import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef,
  ElementRef, inject, input, NgZone, numberAttribute, output,
} from '@angular/core';
import { DeliveryDashGame } from './delivery-dash.game';
import { RunResult } from './delivery-dash.engine';
import { DEFAULT_MUSIC_BASE } from './delivery-dash.music';
import { DEFAULT_SFX_BASE } from './delivery-dash.sfx';

@Component({
  selector: 'app-delivery-dash',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delivery-dash.component.html',
  styleUrl: './delivery-dash.component.css',
  host: { '[style.width.px]': 'displayWidth()' },
})
export class DeliveryDashComponent {
  readonly width = input(480, { transform: numberAttribute });
  /** Where the soundtrack files are served from. */
  readonly musicBase = input(DEFAULT_MUSIC_BASE);
  readonly sfxBase = input(DEFAULT_SFX_BASE);
  readonly finished = output<RunResult>();
  readonly displayWidth = computed(() => Number.isFinite(this.width()) ? Math.max(240, this.width()) : 480);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private game?: DeliveryDashGame;

  constructor() {
    const render = afterNextRender(() => this.zone.runOutsideAngular(() => {
      const root = this.element.nativeElement.querySelector<HTMLElement>('.delivery-dash');
      const win = root?.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      if (!root || !win) return;
      try {
        this.game = new DeliveryDashGame(root, win, result => this.zone.run(() => this.finished.emit(result)), this.musicBase(), this.sfxBase());
      } catch {
        const title = root.querySelector('[data-overlay-title]');
        const message = root.querySelector('[data-overlay-message]');
        if (title) title.textContent = 'Game unavailable';
        if (message) message.textContent = 'Your browser could not start this game.';
      }
    }));
    this.destroyRef.onDestroy(() => { render.destroy(); this.game?.destroy(); });
  }
}
