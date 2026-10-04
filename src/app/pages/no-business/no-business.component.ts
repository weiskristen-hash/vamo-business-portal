import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-no-business',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="no-business-page">
      <div class="no-business-card">
        <div class="icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <line x1="9" y1="22" x2="9" y2="12"></line>
            <line x1="15" y1="22" x2="15" y2="12"></line>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </div>

        <h1 class="card-title">This VAMO account is not currently linked to a business.</h1>

        <p class="card-description">
          You are currently signed in as <strong>{{ (authService.user$ | async)?.email }}</strong>. The VAMO Business Portal is dedicated exclusively to verified businesses, venues, and event organizers.
        </p>

        <div class="action-box">
          <div class="action-row">
            <div class="action-text">
              <strong>Are you a business owner in the Dominican Republic?</strong>
              <span>Claim or register your business profile to start managing posts and promotions.</span>
            </div>
            <a routerLink="/onboarding" [queryParams]="{ mode: 'business' }" class="btn btn-primary">
              Set up Business Profile →
            </a>
          </div>
        </div>

        <div class="card-footer">
          <button type="button" class="btn btn-ghost" (click)="signOut()">
            Sign out / Switch account
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
      padding: 30px;
      background: var(--vamo-gradient-bg);
    }

    .no-business-card {
      width: 100%;
      max-width: 580px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      padding: 40px;
      text-align: center;
      box-shadow: var(--vamo-shadow-md);
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .icon-wrap {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(236, 72, 153, 0.1);
      border: 1px solid rgba(236, 72, 153, 0.25);
      color: var(--vamo-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }

    .card-title {
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--vamo-text);
      line-height: 1.3;
      margin-bottom: 14px;
    }

    .card-description {
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--vamo-text-muted);
      margin-bottom: 28px;
    }

    .card-description strong {
      color: var(--vamo-text);
    }

    .action-box {
      width: 100%;
      background: var(--vamo-surface-subtle);
      border: 1px solid var(--vamo-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: left;
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
      font-size: 0.9rem;
      color: #ffffff;
    }

    .action-text span {
      font-size: 0.8rem;
      color: var(--vamo-text-muted);
      line-height: 1.4;
    }

    .card-footer {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    @media (max-width: 640px) {
      .no-business-card {
        padding: 28px 20px;
      }
      .action-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .action-row .btn {
        width: 100%;
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
