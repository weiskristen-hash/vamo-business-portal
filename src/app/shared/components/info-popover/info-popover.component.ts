import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

let nextInfoPopoverUid = 0;

@Component({
  selector: 'app-info-popover',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <span class="info-popover-root">
      <button
        #triggerBtn
        type="button"
        class="info-popover-trigger"
        [class.is-open]="isOpen()"
        [attr.aria-label]="ariaLabel || title"
        [attr.aria-expanded]="isOpen()"
        [attr.aria-controls]="popoverId"
        aria-haspopup="dialog"
        (click)="toggle($event)"
        (keydown.enter)="onTriggerKey($event)"
        (keydown.space)="onTriggerKey($event)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.25"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>

      <div
        *ngIf="isOpen()"
        #panelEl
        [id]="popoverId"
        class="info-popover-panel"
        [class.align-end]="align === 'end'"
        [style.transform]="panelShiftPx() !== 0 ? 'translateX(' + panelShiftPx() + 'px)' : null"
        role="dialog"
        [attr.aria-label]="title || ariaLabel"
        (click)="$event.stopPropagation()"
      >
        <div class="info-popover-header">
          <strong class="info-popover-title">{{ title }}</strong>
          <button
            type="button"
            class="info-popover-close"
            [attr.aria-label]="'COMMON.CLOSE_DIALOG' | translate"
            (click)="close($event, true)"
          >
            ✕
          </button>
        </div>
        <div class="info-popover-body">
          <p *ngFor="let p of paragraphs" class="info-popover-paragraph">{{ p }}</p>
        </div>
      </div>
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      line-height: 1;
    }

    .info-popover-root {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .info-popover-trigger {
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid rgba(10, 178, 220, 0.38);
      background: rgba(10, 178, 220, 0.1);
      color: var(--vamo-helper-blue, #0369a1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      flex-shrink: 0;
    }

    .info-popover-trigger:hover,
    .info-popover-trigger.is-open {
      background: rgba(10, 178, 220, 0.2);
      border-color: var(--vamo-info, #0AB2DC);
      color: #075985;
    }

    .info-popover-trigger:focus-visible {
      outline: 2px solid var(--vamo-info, #0AB2DC);
      outline-offset: 2px;
      box-shadow: 0 0 0 3px rgba(10, 178, 220, 0.2);
    }

    .info-popover-panel {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 120;
      width: min(330px, calc(100vw - 24px));
      background: var(--vamo-surface, #ffffff);
      border: 1px solid rgba(10, 178, 220, 0.35);
      border-radius: var(--vamo-radius-md, 14px);
      padding: 14px 15px;
      box-shadow:
        0 14px 30px -6px rgba(15, 23, 42, 0.18),
        0 4px 10px -3px rgba(15, 23, 42, 0.08);
      text-align: left;
      font-weight: 400;
      white-space: normal;
      cursor: default;
    }

    .info-popover-panel.align-end {
      left: auto;
      right: 0;
    }

    .info-popover-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      padding-bottom: 7px;
      border-bottom: 1px solid rgba(10, 178, 220, 0.18);
    }

    .info-popover-title {
      font-size: 0.86rem;
      font-weight: 700;
      color: var(--vamo-helper-blue, #0369a1);
      line-height: 1.35;
    }

    .info-popover-close {
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--vamo-text-muted, #475569);
      font-size: 0.78rem;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
    }

    .info-popover-close:hover {
      background: var(--vamo-surface-subtle, #f1f5f9);
      color: var(--vamo-text, #0f172a);
    }

    .info-popover-body {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .info-popover-paragraph {
      margin: 0;
      font-size: 0.81rem;
      line-height: 1.48;
      color: #334155;
    }
  `],
})
export class InfoPopoverComponent implements OnDestroy {
  private static activeInstance: InfoPopoverComponent | null = null;

  private readonly hostEl = inject(ElementRef<HTMLElement>);

  @ViewChild('triggerBtn') triggerBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('panelEl') panelEl?: ElementRef<HTMLElement>;

  @Input() ariaLabel = '';
  @Input() title = '';
  @Input() paragraphs: string[] = [];
  @Input() align: 'start' | 'end' = 'start';

  readonly popoverId = `vamo-info-popover-${++nextInfoPopoverUid}`;
  readonly isOpen = signal(false);
  readonly panelShiftPx = signal(0);

  onTriggerKey(event: Event): void {
    event.stopPropagation();
  }

  toggle(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (InfoPopoverComponent.activeInstance && InfoPopoverComponent.activeInstance !== this) {
      InfoPopoverComponent.activeInstance.close();
    }
    InfoPopoverComponent.activeInstance = this;
    this.panelShiftPx.set(0);
    this.isOpen.set(true);
    setTimeout(() => this.clampToViewport(), 0);
  }

  close(event?: Event, restoreFocus = false): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.panelShiftPx.set(0);
    if (InfoPopoverComponent.activeInstance === this) {
      InfoPopoverComponent.activeInstance = null;
    }
    if (restoreFocus) {
      this.triggerBtn?.nativeElement?.focus();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.isOpen()) return;
    event.stopPropagation();
    this.close(undefined, true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.isOpen()) return;
    const target = event?.target as Node | null;
    if (target && this.hostEl.nativeElement.contains(target)) {
      return;
    }
    this.close();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.isOpen()) {
      this.panelShiftPx.set(0);
      setTimeout(() => this.clampToViewport(), 0);
    }
  }

  private clampToViewport(): void {
    if (!this.isOpen() || typeof window === 'undefined') return;
    const el = this.panelEl?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const margin = 12;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    if (vw <= 0) return;

    let shift = 0;
    if (rect.right > vw - margin) {
      shift = (vw - margin) - rect.right;
    }
    if (rect.left + shift < margin) {
      shift = margin - rect.left;
    }
    if (Math.abs(shift) >= 1) {
      this.panelShiftPx.set(Math.round(shift));
    }
  }

  ngOnDestroy(): void {
    if (InfoPopoverComponent.activeInstance === this) {
      InfoPopoverComponent.activeInstance = null;
    }
  }
}
