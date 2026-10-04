import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sso-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="callback-card">
        <ng-container *ngIf="!errorMessage; else errorTpl">
          <div class="spinner"></div>
          <h2>Authenticating with VAMO…</h2>
          <p>Restoring your business session, please wait.</p>
        </ng-container>
        <ng-template #errorTpl>
          <div class="error-icon">!</div>
          <h2>Authentication Failed</h2>
          <p class="error-msg">{{ errorMessage }}</p>
          <button type="button" class="btn-return" (click)="returnToLogin()">Return to Login</button>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vamo-bg-base);
    }
    .callback-card {
      text-align: center;
      background: var(--vamo-bg-card);
      border: 1px solid var(--vamo-border-glass);
      border-radius: 14px;
      padding: 36px 48px;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 440px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      border-top-color: var(--vamo-pink);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #ef4444;
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-msg {
      color: #fca5a5;
      font-size: 0.9rem;
      margin: 0;
    }
    .btn-return {
      margin-top: 8px;
      padding: 8px 18px;
      border-radius: 8px;
      background: var(--vamo-pink);
      color: #ffffff;
      border: none;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-return:hover {
      opacity: 0.9;
    }
  `],
})
export class SsoCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  errorMessage = '';

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParams;
    const errorParam = params['error'] || params['error_description'];

    if (errorParam) {
      await this.router.navigate(['/login'], { queryParams: { error: errorParam } });
      return;
    }

    // Safety timeout to prevent any permanent spinner lock
    const timeoutId = setTimeout(() => {
      if (!this.errorMessage) {
        this.errorMessage = 'Authentication timed out. Please try signing in again.';
      }
    }, 12000);

    try {
      // 1. Check for token parameters in query params (or URL fragment if passed as hash)
      const accessToken = params['access_token'];
      const refreshToken = params['refresh_token'];
      const expires = params['expires'] ? Number(params['expires']) : null;

      let user: any = null;

      if (accessToken) {
        user = await this.authService.handleSsoTokens(accessToken, refreshToken, expires);
      } else {
        // Fallback: restore active Directus cookie/storage session
        user = await this.authService.restoreSession();
      }

      clearTimeout(timeoutId);

      if (!user) {
        await this.router.navigate(['/login'], { queryParams: { error: 'sso_failed' } });
        return;
      }

      // Retrieve preserved signupIntent and returnUrl from sessionStorage if set
      let signupIntent: string | null = null;
      let returnUrl = '/app/overview';
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          signupIntent = window.sessionStorage.getItem('vamo_auth_signup_intent');
          window.sessionStorage.removeItem('vamo_auth_signup_intent');

          const stored = window.sessionStorage.getItem('vamo_auth_return_url');
          if (stored && this.isSafeInternalUrl(stored)) {
            returnUrl = stored;
          }
          window.sessionStorage.removeItem('vamo_auth_return_url');
        }
      } catch {
        // Ignore session storage error
      }

      const hasLinkedBusiness = !!(user.provider_link && user.provider_link.id);

      if (signupIntent === 'business' || returnUrl.includes('social=business')) {
        if (hasLinkedBusiness) {
          // User already has a linked business: route normally to /app/overview or canonical destination
          const dest = (returnUrl && !returnUrl.startsWith('/onboarding') && returnUrl !== '/app/listings/create')
            ? returnUrl
            : '/app/overview';
          await this.router.navigateByUrl(dest);
        } else {
          // User does not have a linked business: resume business onboarding flow
          await this.router.navigate(['/onboarding'], { queryParams: { social: 'business' } });
        }
      } else {
        // Normal Google login
        if (hasLinkedBusiness) {
          await this.router.navigateByUrl(returnUrl);
        } else {
          await this.router.navigate(['/no-business']);
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('[SsoCallback] Callback processing error:', err);
      this.errorMessage = 'Could not verify your authentication session. Please try again.';
    }
  }

  private isSafeInternalUrl(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return false;
    if (/[\r\n\t\\]/.test(url)) return false;
    return true;
  }

  async returnToLogin(): Promise<void> {
    await this.router.navigate(['/login']);
  }
}
