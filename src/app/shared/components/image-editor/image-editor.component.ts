import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ImageCroppedEvent,
  ImageCropperComponent,
  ImageTransform,
} from 'ngx-image-cropper';
import { FitImageComponent } from '../fit-image/fit-image.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

export type ImageEditorMode = 'crop' | 'full';

/** What the editor hands back when applied. */
export interface ImageEditorResult {
  file: File;
  mode: ImageEditorMode;
}

/** Longest edge of a cropped image; matches VAMO app CROP_OUTPUT_SIZE (1200 px). */
export const CROP_OUTPUT_SIZE = 1200;

/**
 * Reusable responsive post image editor matching VAMO mobile app behavior:
 * - Crop to Square (1:1, drag/reposition, resize frame, 1x-3x zoom slider & +/- controls, touch & mouse)
 * - Keep Full Image (preserves original file; app renders whole image over a blurred backdrop)
 * - Nearly square images default to Full Image mode unless an explicit initialMode is passed
 * - Cropper remains mounted when switching modes so crop frame & zoom are preserved
 * - Outputs up to 1200 x 1200 JPEG at 90% quality without upscaling
 */
@Component({
  selector: 'app-image-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ImageCropperComponent,
    FitImageComponent,
    TranslatePipe,
  ],
  template: `
    <div
      class="ie-backdrop"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.TITLE' | translate"
    >
      <div class="ie-modal" (click)="$event.stopPropagation()">
        <!-- Header -->
        <header class="ie-header">
          <button
            type="button"
            class="ie-cancel-link"
            (click)="cancel()"
          >
            {{ 'PORTAL.COMMON.CANCEL' | translate }}
          </button>

          <div class="ie-title-group">
            <h2 class="ie-title">{{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.TITLE' | translate }}</h2>
            <span *ngIf="queueTotal && queueTotal > 1 && queueIndex" class="ie-queue-badge">
              {{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.QUEUE_PROGRESS' | translate:{ current: queueIndex, total: queueTotal } }}
            </span>
          </div>

          <button
            type="button"
            class="ie-close-btn"
            (click)="cancel()"
            [attr.aria-label]="'PORTAL.COMMON.CANCEL' | translate"
          >
            ✕
          </button>
          <span class="ie-header-spacer" aria-hidden="true"></span>
        </header>

        <!-- Mode Selector Tabs -->
        <div class="ie-modes" role="tablist">
          <button
            type="button"
            role="tab"
            class="ie-mode-btn"
            data-mode="crop"
            [class.ie-mode-btn--active]="mode() === 'crop'"
            [attr.aria-selected]="mode() === 'crop'"
            (click)="setMode('crop')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path>
              <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>
            </svg>
            <span>{{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.MODE_CROP' | translate }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="ie-mode-btn"
            data-mode="full"
            [class.ie-mode-btn--active]="mode() === 'full'"
            [attr.aria-selected]="mode() === 'full'"
            (click)="setMode('full')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span>{{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.MODE_FULL' | translate }}</span>
          </button>
        </div>

        <!-- Body -->
        <div class="ie-body">
          <div class="ie-workspace">
            <!-- Cropper stays mounted in both modes so switching back preserves the frame & zoom -->
            <div class="ie-stage" [class.ie-stage--hidden]="mode() !== 'crop'">
              <image-cropper
                class="ie-cropper"
                [imageFile]="file"
                [maintainAspectRatio]="true"
                [aspectRatio]="1"
                [allowMoveImage]="true"
                [transform]="transform"
                [resizeToWidth]="outputSize"
                [onlyScaleDown]="true"
                output="blob"
                format="jpeg"
                [imageQuality]="90"
                backgroundColor="#000000"
                (imageLoaded)="onImageLoaded($event)"
                (cropperReady)="onCropperReady()"
                (imageCropped)="onImageCropped($event)"
                (transformChange)="onTransformChange($event)"
                (loadImageFailed)="onLoadFailed()"
              ></image-cropper>
            </div>

            <!-- Full-image visual preview stage when in full mode -->
            <div *ngIf="mode() === 'full'" class="ie-full-stage">
              <app-fit-image
                [src]="originalUrl"
                [alt]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.PREVIEW_ALT' | translate"
                class="ie-full-stage-img"
              ></app-fit-image>
            </div>

            <!-- Zoom Controls (Crop Mode only) -->
            <div *ngIf="mode() === 'crop'" class="ie-zoom-bar">
              <button
                type="button"
                class="ie-zoom-btn"
                data-zoom-action="out"
                [disabled]="zoom <= 1"
                (click)="stepZoom(-0.2)"
                [attr.aria-label]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.ZOOM_OUT' | translate"
                [title]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.ZOOM_OUT' | translate"
              >
                −
              </button>
              <input
                type="range"
                class="ie-zoom-slider"
                min="1"
                max="3"
                step="0.05"
                [ngModel]="zoom"
                (ngModelChange)="onZoomChange($event)"
                [attr.aria-label]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.ZOOM' | translate"
              />
              <button
                type="button"
                class="ie-zoom-btn"
                data-zoom-action="in"
                [disabled]="zoom >= 3"
                (click)="stepZoom(0.2)"
                [attr.aria-label]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.ZOOM_IN' | translate"
                [title]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.ZOOM_IN' | translate"
              >
                +
              </button>
              <span class="ie-zoom-value">{{ zoom | number:'1.1-1' }}×</span>
            </div>

            <p class="ie-hint">
              {{ (mode() === 'crop' ? 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.CROP_HINT' : 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.FULL_HINT') | translate }}
            </p>
          </div>

          <!-- Live App Card Preview -->
          <div class="ie-preview-col">
            <p class="ie-preview-label">{{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.PREVIEW' | translate }}</p>
            <div class="ie-preview-card">
              <div class="ie-preview-media">
                <app-fit-image
                  *ngIf="mode() === 'full' || ready(); else previewSkeleton"
                  [src]="previewUrl"
                  [alt]="'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.PREVIEW_ALT' | translate"
                  class="ie-preview-img"
                ></app-fit-image>
                <ng-template #previewSkeleton>
                  <div class="ie-preview-skeleton"></div>
                </ng-template>
              </div>
              <div class="ie-preview-card-body">
                <div class="ie-preview-line ie-preview-line--title"></div>
                <div class="ie-preview-line"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="ie-footer">
          <button type="button" class="btn btn-secondary" (click)="cancel()">
            {{ 'PORTAL.COMMON.CANCEL' | translate }}
          </button>
          <button type="button" class="btn btn-primary ie-apply-btn" (click)="apply()">
            {{ 'PORTAL.EVENT_EDITOR.IMAGE_EDITOR.APPLY' | translate }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ie-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1200;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .ie-modal {
      width: 100%;
      max-width: 780px;
      max-height: calc(100dvh - 32px);
      background: var(--vamo-surface, #ffffff);
      border: 1px solid var(--vamo-border, #e2e8f0);
      border-radius: var(--vamo-radius-lg, 22px);
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .ie-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vamo-border, #e2e8f0);
      flex-shrink: 0;
    }

    .ie-cancel-link {
      background: none;
      border: none;
      color: var(--vamo-text-muted, #475569);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: var(--vamo-radius-sm, 8px);
      display: none;
    }

    .ie-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .ie-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--vamo-text, #0f172a);
      margin: 0;
    }

    .ie-queue-badge {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--vamo-primary, #8070C0);
      background: var(--vamo-purple-light, rgba(128, 112, 192, 0.12));
      padding: 3px 10px;
      border-radius: var(--vamo-radius-full, 9999px);
      white-space: nowrap;
    }

    .ie-close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid var(--vamo-border, #e2e8f0);
      background: var(--vamo-surface-subtle, #f1f5f9);
      color: var(--vamo-text-muted, #475569);
      font-size: 14px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .ie-close-btn:hover {
      background: var(--vamo-border, #e2e8f0);
      color: var(--vamo-text, #0f172a);
    }

    .ie-modes {
      display: flex;
      gap: 8px;
      padding: 14px 20px 0;
      flex-shrink: 0;
    }

    .ie-mode-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: var(--vamo-radius-full, 9999px);
      border: 1px solid var(--vamo-border, #e2e8f0);
      background: var(--vamo-surface-subtle, #f1f5f9);
      color: var(--vamo-text-muted, #475569);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .ie-mode-btn:hover:not(.ie-mode-btn--active) {
      border-color: var(--vamo-border-hover, #cbd5e1);
      color: var(--vamo-text, #0f172a);
    }

    .ie-mode-btn--active {
      background: var(--vamo-secondary, #F93CAD);
      border-color: var(--vamo-secondary, #F93CAD);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(249, 60, 173, 0.25);
    }

    .ie-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 210px;
      gap: 20px;
      padding: 16px 20px 20px;
      overflow-y: auto;
      position: relative;
      flex: 1;
      min-height: 0;
    }

    .ie-workspace {
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    .ie-stage {
      height: 360px;
      border-radius: var(--vamo-radius-md, 14px);
      overflow: hidden;
      background: #0f172a;
      border: 1px solid var(--vamo-border, #e2e8f0);
    }

    .ie-stage--hidden {
      position: absolute;
      inset: 0 0 auto 0;
      visibility: hidden;
      pointer-events: none;
      opacity: 0;
    }

    .ie-cropper {
      display: block;
      height: 100%;
      width: 100%;
      padding: 0;
      --cropper-overlay-color: #0f172a;
      --cropper-outline-color: rgba(15, 23, 42, 0.65);
      --cropper-color: #ffffff;
      --cropper-resize-square-bg: #F93CAD;
    }

    .ie-full-stage {
      height: 360px;
      border-radius: var(--vamo-radius-md, 14px);
      overflow: hidden;
      background: #0f172a;
      border: 1px solid var(--vamo-border, #e2e8f0);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ie-full-stage-img {
      width: 100%;
      height: 100%;
      max-width: 360px;
      aspect-ratio: 1 / 1;
    }

    .ie-zoom-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      padding: 8px 12px;
      background: var(--vamo-surface-subtle, #f1f5f9);
      border-radius: var(--vamo-radius-md, 14px);
      border: 1px solid var(--vamo-border, #e2e8f0);
    }

    .ie-zoom-btn {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 1px solid var(--vamo-border, #e2e8f0);
      background: var(--vamo-surface, #ffffff);
      color: var(--vamo-text, #0f172a);
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .ie-zoom-btn:hover:not(:disabled) {
      border-color: var(--vamo-secondary, #F93CAD);
      color: var(--vamo-secondary, #F93CAD);
    }

    .ie-zoom-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .ie-zoom-slider {
      flex: 1;
      accent-color: var(--vamo-secondary, #F93CAD);
      cursor: pointer;
    }

    .ie-zoom-value {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--vamo-text-muted, #475569);
      min-width: 34px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .ie-hint {
      font-size: 0.8rem;
      line-height: 1.45;
      color: var(--vamo-text-muted, #475569);
      margin: 10px 0 0;
    }

    .ie-preview-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .ie-preview-label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vamo-text-muted, #475569);
      margin: 0 0 10px;
    }

    /* Mimics the VAMO app event card (Home / Discover) */
    .ie-preview-card {
      width: 100%;
      max-width: 196px;
      border-radius: 18px;
      overflow: hidden;
      background: linear-gradient(160deg, #12122a 0%, #1d0c1c 100%);
      border: 1px solid rgba(15, 23, 42, 0.25);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
    }

    .ie-preview-media {
      width: 100%;
      aspect-ratio: 1 / 1;
      background: #16162a;
      overflow: hidden;
    }

    .ie-preview-img {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ie-preview-skeleton {
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #1e1e38 25%, #2b2b4a 50%, #1e1e38 75%);
      background-size: 200% 100%;
      animation: ie-shimmer 1.2s infinite;
    }

    @keyframes ie-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .ie-preview-card-body {
      padding: 12px 12px 14px;
    }

    .ie-preview-line {
      height: 7px;
      width: 60%;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.2);
    }

    .ie-preview-line--title {
      width: 82%;
      margin-bottom: 7px;
      background: rgba(254, 57, 127, 0.75);
    }

    .ie-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 20px;
      border-top: 1px solid var(--vamo-border, #e2e8f0);
      background: var(--vamo-surface, #ffffff);
      flex-shrink: 0;
    }

    .ie-header-spacer {
      display: none;
      min-width: 56px;
    }

    @media (max-width: 720px) {
      .ie-backdrop {
        padding: 0;
        align-items: flex-end;
      }

      .ie-modal {
        max-width: 100%;
        max-height: 100dvh;
        height: 100dvh;
        border-radius: 0;
        border: none;
      }

      .ie-cancel-link {
        display: inline-flex;
        min-width: 56px;
      }

      .ie-close-btn {
        display: none;
      }

      .ie-header-spacer {
        display: inline-block;
      }

      .ie-header {
        padding: 12px 16px;
      }

      .ie-modes {
        padding: 12px 16px 0;
      }

      .ie-body {
        grid-template-columns: 1fr;
        gap: 16px;
        padding: 12px 16px 16px;
      }

      .ie-stage,
      .ie-full-stage {
        height: 44vh;
        min-height: 240px;
      }

      .ie-preview-card {
        max-width: 160px;
      }

      .ie-footer {
        padding: 12px 16px;
      }

      .ie-footer .btn-secondary {
        display: none;
      }

      .ie-apply-btn {
        width: 100%;
      }
    }
  `],
})
export class ImageEditorComponent implements OnInit, OnDestroy {
  /** The original file as picked by the user. */
  @Input({ required: true }) file!: File;
  /** Mode to start in; defaults to crop unless the image is already nearly square. */
  @Input() initialMode?: ImageEditorMode;
  /** Optional 1-based position when editing a batch sequentially. */
  @Input() queueIndex?: number;
  /** Optional total count when editing a batch sequentially. */
  @Input() queueTotal?: number;

  @Output() applied = new EventEmitter<ImageEditorResult>();
  @Output() cancelled = new EventEmitter<void>();

  mode = signal<ImageEditorMode>('crop');
  originalUrl = '';
  croppedUrl = signal<string | null>(null);
  transform: ImageTransform = { scale: 1 };
  zoom = 1;
  ready = signal(false);

  readonly outputSize = CROP_OUTPUT_SIZE;

  private croppedBlob: Blob | null = null;

  ngOnInit(): void {
    this.originalUrl = URL.createObjectURL(this.file);
    if (this.initialMode) {
      this.mode.set(this.initialMode);
    }
  }

  ngOnDestroy(): void {
    if (this.originalUrl) {
      try {
        URL.revokeObjectURL(this.originalUrl);
      } catch {}
    }
    this.revokeCropped();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.cancel();
  }

  setMode(mode: ImageEditorMode): void {
    this.mode.set(mode);
  }

  onImageLoaded(img: { original: { size: { width: number; height: number } } }): void {
    const { width, height } = img?.original?.size ?? { width: 0, height: 0 };
    // Already (almost) square: nothing to crop, start with the whole image
    if (!this.initialMode && width && height && Math.abs(width / height - 1) < 0.02) {
      this.mode.set('full');
    }
  }

  onCropperReady(): void {
    this.ready.set(true);
  }

  onZoomChange(value: number): void {
    const numeric = Number(value);
    const clamped = Number.isFinite(numeric) ? Math.min(3, Math.max(1, numeric)) : 1;
    this.zoom = clamped;
    this.transform = { ...this.transform, scale: clamped };
  }

  stepZoom(delta: number): void {
    this.onZoomChange(Math.min(3, Math.max(1, Math.round((this.zoom + delta) * 10) / 10)));
  }

  /** Pinch-zoom or transform updates from inside the cropper. */
  onTransformChange(t: ImageTransform): void {
    this.transform = t;
    this.zoom = t.scale ?? 1;
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.croppedBlob = event.blob ?? null;
    this.revokeCropped();
    this.croppedUrl.set(this.croppedBlob ? URL.createObjectURL(this.croppedBlob) : null);
  }

  onLoadFailed(): void {
    // Unreadable for the cropper (e.g. HEIC in a browser): keep the image as it is
    this.applied.emit({ file: this.file, mode: 'full' });
  }

  apply(): void {
    if (this.mode() === 'full' || !this.croppedBlob) {
      this.applied.emit({ file: this.file, mode: 'full' });
      return;
    }
    const baseName = this.file.name.replace(/\.[^.]+$/, '') || 'photo';
    const name = `${baseName}-square.jpg`;
    const file = new File([this.croppedBlob], name, { type: 'image/jpeg' });
    this.applied.emit({ file, mode: 'crop' });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  get previewUrl(): string {
    return this.mode() === 'crop' ? (this.croppedUrl() ?? this.originalUrl) : this.originalUrl;
  }

  private revokeCropped(): void {
    const url = this.croppedUrl();
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }
}
