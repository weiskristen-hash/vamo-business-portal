import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService, SupportedLang } from './i18n.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lang-selector" [class.lang-selector--dark]="theme === 'dark'" role="group" aria-label="Language selection">
      <button
        type="button"
        class="lang-btn"
        [class.lang-btn--active]="i18n.lang() === 'en'"
        (click)="switchLang('en')"
        [attr.aria-pressed]="i18n.lang() === 'en'"
      >
        EN
      </button>
      <span class="lang-divider" aria-hidden="true">|</span>
      <button
        type="button"
        class="lang-btn"
        [class.lang-btn--active]="i18n.lang() === 'es'"
        (click)="switchLang('es')"
        [attr.aria-pressed]="i18n.lang() === 'es'"
      >
        ES
      </button>
    </div>
  `,
  styles: [`
    .lang-selector {
      display: inline-flex;
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 9999px;
      padding: 2px 6px;
      gap: 2px;
      user-select: none;
    }

    .lang-btn {
      background: transparent;
      border: none;
      font-size: 0.76rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #64748b;
      padding: 3px 8px;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.15s ease;
      line-height: 1;
      font-family: inherit;
    }

    .lang-btn:hover:not(.lang-btn--active) {
      color: #0f172a;
    }

    .lang-btn--active {
      background: #ffffff;
      color: var(--vamo-pink, #ec4899);
      font-weight: 700;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .lang-divider {
      color: #cbd5e1;
      font-size: 0.72rem;
      line-height: 1;
    }

    /* Dark theme variant for dark panels/headers */
    .lang-selector--dark {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .lang-selector--dark .lang-btn {
      color: #94a3b8;
    }

    .lang-selector--dark .lang-btn:hover:not(.lang-btn--active) {
      color: #ffffff;
    }

    .lang-selector--dark .lang-btn--active {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .lang-selector--dark .lang-divider {
      color: rgba(255, 255, 255, 0.2);
    }
  `],
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);

  @Input() theme: 'light' | 'dark' = 'light';

  switchLang(lang: SupportedLang): void {
    this.i18n.setLang(lang);
  }
}
