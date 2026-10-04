import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LanguageSelectorComponent } from '../../core/i18n/language-selector.component';

@Component({
  selector: 'app-no-business',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, LanguageSelectorComponent],
  template: `
    <div class="no-business-page">
      <div class="no-business-card">
        <div class="card-top-actions">
          <app-language-selector></app-language-selector>
        </div>

        <div class="icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <line x1="9" y1="22" x2="9" y2="12"></line>
            <line x1="15" y1="22" x2="15" y2="12"></line>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </div>

        <h1 class="card-title">{{ 'PORTAL.NO_BUSINESS.TITLE' | translate }}</h1>

        <p class="card-description">
          {{ 'PORTAL.NO_BUSINESS.DESC' | translate: { email: (authService.user$ | async)?.email || '' } }}
        </p>

        <div class="action-box">
          <div class="action-row">
            <div class="action-text">
              <strong>{{ 'PORTAL.NO_BUSINESS.QUESTION' | translate }}</strong>
              <span>{{ 'PORTAL.NO_BUSINESS.SUB' | translate }}</span>
            </div>
            <a routerLink="/onboarding" [queryParams]="{ mode: 'business' }" class="btn btn-primary action-btn">
              {{ 'PORTAL.NO_BUSINESS.SETUP_BTN' | translate }}
            </a>
          </div>
        </div>

        <div class="card-footer">
          <button type="button" class="btn btn-ghost" (click)="signOut()">
            {{ 'PORTAL.NO_BUSINESS.SIGNOUT_BTN' | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .no-business-page {
      min-height: 100vh;
      width: 100vw;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px 16px;
      background: var(--vamo-background, #f8fafc);
      box-sizing: border-box;
    }

    .no-business-card {
      width: 100%;
      max-width: 580px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 36px 32px;
      text-align: center;
      box-shadow:
        0 10px 25px -5px rgba(15, 23, 42, 0.05),
        0 8px 10px -6px rgba(15, 23, 42, 0.03);
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }

    .card-top-actions {
      width: 100%;
      display: flex;
      justify-content: flex-end;
      margin-bottom: 8px;
    }

    .icon-wrap {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: rgba(236, 72, 153, 0.1);
      border: 1px solid rgba(236, 72, 153, 0.25);
      color: var(--vamo-pink, #ec4899);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }

    .card-title {
      font-size: 1.45rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.3;
      margin-bottom: 12px;
      letter-spacing: -0.02em;
    }

    .card-description {
      font-size: 0.94rem;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 26px;
    }

    .action-box {
      width: 100%;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: left;
      box-sizing: border-box;
    }

    .action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .action-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .action-text strong {
      font-size: 0.92rem;
      font-weight: 700;
      color: #0f172a;
    }

    .action-text span {
      font-size: 0.82rem;
      color: #64748b;
      line-height: 1.4;
    }

    .action-btn {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--vamo-pink, #ec4899), #db2777);
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.88rem;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.25);
    }

    .btn-primary:hover {
      opacity: 0.95;
      box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);
      transform: translateY(-1px);
    }

    .card-footer {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .btn-ghost {
      background: transparent;
      color: #64748b;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 18px;
      font-weight: 600;
      font-size: 0.86rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-ghost:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    @media (max-width: 640px) {
      .no-business-card {
        padding: 24px 18px;
      }
      .action-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .action-btn {
        width: 100%;
        box-sizing: border-box;
      }
    }
  `],
})
export class NoBusinessComponent {
  authService = inject(AuthService);

  signOut(): void {
    this.authService.logout();
  }
}
