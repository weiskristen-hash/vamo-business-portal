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
 * - Images close to the container's aspect ratio (within 15% crop tolerance) -> `object-fit: cover`.
 * - Images whose shape clearly differs (portrait flyers OR wide landscape photos in a 1:1 square
 *   container where cover-cropping would remove >15% of the width or height) -> `object-fit: contain`
 *   over a blurred copy of the same image (`blur(18px) brightness(0.85)`, `scale(1.2)`) so the whole
 *   image and promotional text remain readable with no empty bars.
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

  /** Max fraction of image width or height we're willing to crop before switching to contain. */
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
    // Match VAMO mobile app: default to 1:1 square when host box is not laid out yet.
    const boxRatio = boxW > 0 && boxH > 0 ? boxW / boxH : 1;

    // Contain once cover would crop away more than 15% of the image's width or height.
    const tooNarrow = imgRatio < boxRatio * (1 - FitImageComponent.MAX_CROP);
    const tooWide = imgRatio * (1 - FitImageComponent.MAX_CROP) > boxRatio;
    this.contain.set(tooNarrow || tooWide);
  }

  onError(): void {
    if (this.fallbackSrc && this.resolvedSrc() !== this.fallbackSrc) {
      this.contain.set(false);
      this.resolvedSrc.set(this.fallbackSrc);
    }
  }
}
