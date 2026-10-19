import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';

/**
 * Renders an image inside a fixed-aspect container with smart fitting matching the VAMO mobile app:
 * - Landscape / near-matching ratio → `object-fit: cover` (fills the box cleanly).
 * - Narrow / portrait image (e.g. a flyer) that would lose >15% of its height when cover-cropped →
 *   `object-fit: contain` over a blurred copy of the same image so the whole image is readable
 *   and there are no empty bars.
 */
@Component({
  selector: 'app-fit-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fit-image--contain]': 'contain()',
  },
  template: `
    @if (contain()) {
      <img
        class="fit-image-backdrop"
        [src]="resolvedSrc()"
        alt=""
        aria-hidden="true"
      />
    }
    <img
      [class]="'fit-image-main' + (contain() ? ' contain' : '') + (imgClass ? ' ' + imgClass : '')"
      [src]="resolvedSrc()"
      [alt]="alt"
      [attr.loading]="loading"
      (load)="onLoad($event)"
      (error)="onError()"
    />
  `,
  styles: [`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .fit-image-backdrop {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(18px) brightness(0.85);
      transform: scale(1.2);
      pointer-events: none;
    }

    .fit-image-main {
      position: relative;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .fit-image-main.contain {
      object-fit: contain;
    }
  `],
})
export class FitImageComponent implements OnChanges {
  @Input({ required: true }) src!: string;
  @Input() alt = '';
  @Input() loading: 'lazy' | 'eager' | null = null;
  @Input() fallbackSrc = '/assets/placeholder.png';
  @Input() imgClass = '';

  private host = inject(ElementRef<HTMLElement>);

  /** Max fraction of image height we're willing to crop before switching to contain. */
  private static readonly MAX_CROP = 0.15;

  contain = signal(false);
  resolvedSrc = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src']) {
      this.contain.set(false);
      this.resolvedSrc.set(this.src || this.fallbackSrc);
    }
  }

  onLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement | null;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const hostEl = this.host.nativeElement;
    const boxW = hostEl.clientWidth;
    const boxH = hostEl.clientHeight;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = boxW > 0 && boxH > 0 ? boxW / boxH : 16 / 9;

    // If the image is narrower than the container beyond the crop tolerance, show it whole.
    this.contain.set(imgRatio < boxRatio * (1 - FitImageComponent.MAX_CROP));
  }

  onError(): void {
    if (this.fallbackSrc && this.resolvedSrc() !== this.fallbackSrc) {
      this.contain.set(false);
      this.resolvedSrc.set(this.fallbackSrc);
    }
  }
}
