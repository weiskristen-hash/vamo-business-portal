import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, effect, inject, signal } from '@angular/core';
import { GoogleAuthService } from '../../../core/services/google-auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Uses the same explicit Google popup button as the portal login page. */
@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div [attr.inert]="disabled ? '' : null" [attr.aria-busy]="disabled">
      <div #buttonHost [hidden]="!ready()"></div>
      @if (!ready()) {
        <button type="button" class="btn btn-secondary google-btn" [disabled]="disabled" (click)="fallback.emit()">
          {{ 'AUTH.LOGIN_GOOGLE' | translate }}
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; }
    .google-btn { width: 100%; }
  `],
})
export class GoogleSignInButtonComponent implements AfterViewInit, OnDestroy {
  private google = inject(GoogleAuthService);
  private i18n = inject(I18nService);
  private destroyed = false;
  @ViewChild('buttonHost') private buttonHost!: ElementRef<HTMLElement>;
  @Input() disabled = false;
  @Output() readonly credential = new EventEmitter<string>();
  @Output() readonly fallback = new EventEmitter<void>();
  @Output() readonly failed = new EventEmitter<Error>();
  readonly ready = signal(false);

  constructor() {
    effect(() => {
      const locale = this.i18n.lang();
      if (this.ready()) this.render(locale);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.google.loadGoogleScript();
      if (!this.destroyed) this.ready.set(true);
    } catch {
      // Keep the existing localized fallback available; never redirect to hosted OAuth.
    }
  }

  private render(locale: string): void {
    this.google.renderButton(
      this.buttonHost.nativeElement,
      (credential) => {
        if (!this.destroyed && !this.disabled) this.credential.emit(credential);
      },
      (err) => {
        this.ready.set(false);
        this.failed.emit(err);
      },
      { locale, width: Math.min(400, this.buttonHost.nativeElement.parentElement?.offsetWidth || 320), text: 'continue_with' }
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
