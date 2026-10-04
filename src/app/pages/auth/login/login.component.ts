import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="login-page">
      <!-- Left Hero Panel: Value Statement & VAMO Branding -->
      <div class="login-hero">
        <div class="hero-content">
          <div class="hero-brand">
            <img src="/assets/vamo-logo.png" alt="VAMO" class="hero-logo" onerror="this.style.display='none'" />
            <div class="hero-brand-text">
              <span class="hero-name">VAMO</span>
              <span class="hero-tag">BUSINESS PORTAL</span>
            </div>
          </div>

          <div class="hero-body">
            <h1 class="hero-title">Manage your business on VAMO.</h1>
            <p class="hero-description">
              Update your profile, manage your posts, promote your business and understand how customers are finding you across the Dominican Republic.
            </p>

            <div class="hero-features">
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Desktop-First Command Center</strong>
                  <span>Purpose-built management interface for business operators.</span>
                </div>
              </div>
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Live Platform Sync</strong>
                  <span>Instantly synced with the VAMO mobile app and discovery engine.</span>
                </div>
              </div>
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Audience & Promotions Reach</strong>
                  <span>Grow your visibility and reach travelers and locals effortlessly.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="hero-footer">
            <span>© {{ currentYear }} VAMO. All rights reserved.</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Contained Login Form -->
      <div class="login-panel">
        <div class="login-card">
          <div class="login-card-header">
            <h2 class="card-title">Sign in to your account</h2>
            <p class="card-subtitle">Enter your VAMO business credentials to continue</p>
          </div>

          <!-- Error Alert Banner -->
          <div *ngIf="errorMessage" class="alert-box alert-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Success Alert Banner (e.g. Password Reset) -->
          <div *ngIf="successMessage" class="alert-box alert-success" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>{{ successMessage }}</span>
          </div>

          <!-- Login Form -->
          <form (ngSubmit)="onSubmit()" #loginForm="ngForm" class="login-form">
            <div class="form-group">
              <label for="email" class="form-label">Email address</label>
              <input
                type="email"
                id="email"
                name="email"
                [(ngModel)]="email"
                required
                email
                class="form-input"
                placeholder="operator@yourbusiness.com"
                autocomplete="email"
                [disabled]="loading"
              />
            </div>

            <div class="form-group">
              <div class="password-label-row">
                <label for="password" class="form-label">Password</label>
                <button
                  type="button"
                  class="forgot-link"
                  (click)="openForgotModal()"
                  [disabled]="loading"
                >
                  Forgot password?
                </button>
              </div>
              <div class="password-input-wrapper">
                <input
                  [type]="showPassword ? 'text' : 'password'"
                  id="password"
                  name="password"
                  [(ngModel)]="password"
                  required
                  class="form-input password-input"
                  placeholder="••••••••••••"
                  autocomplete="current-password"
                  [disabled]="loading"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'"
                  tabindex="0"
                >
                  <!-- Eye Off Icon (visible when showPassword is true) -->
                  <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <!-- Eye Icon (visible when showPassword is false) -->
                  <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="btn btn-primary submit-btn"
              [disabled]="loading || !email || !password"
            >
              <span *ngIf="!loading">Sign In</span>
              <span *ngIf="loading" class="spinner-content">
                <span class="spinner"></span>
                <span>Signing in…</span>
              </span>
            </button>
          </form>

          <!-- Social Login Section -->
          <div class="sso-section">
            <div class="divider"><span>OR</span></div>
            <div class="social-btn-stack">
              <button type="button" class="btn btn-secondary social-btn google-btn" (click)="onGoogleLogin()" [disabled]="loading">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <button type="button" class="btn btn-secondary social-btn apple-btn" (click)="onAppleLogin()" [disabled]="loading">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <span>Continue with Apple</span>
              </button>
            </div>
          </div>

          <div class="card-footer-info">
            <span>Don't have an account yet?</span>
            <a routerLink="/register" class="signup-link">
              Register here →
            </a>
          </div>
        </div>
      </div>

      <!-- Forgot Password Modal Dialog -->
      <div class="modal-overlay" *ngIf="showForgotModal" role="dialog" aria-modal="true" aria-labelledby="forgot-modal-title">
        <div class="modal-card">
          <div class="modal-header">
            <div>
              <h3 id="forgot-modal-title" class="modal-title">Reset your password</h3>
              <p class="modal-subtitle">Enter your business email and we'll send you a password reset link.</p>
            </div>
            <button type="button" class="modal-close-btn" (click)="closeForgotModal()" aria-label="Close dialog">×</button>
          </div>

          <div *ngIf="forgotError" class="alert-box alert-error">
            <span>{{ forgotError }}</span>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label for="forgot-email" class="form-label">Email address</label>
              <input
                type="email"
                id="forgot-email"
                [(ngModel)]="forgotEmail"
                class="form-input"
                placeholder="operator@yourbusiness.com"
                [disabled]="forgotLoading"
              />
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" (click)="closeForgotModal()" [disabled]="forgotLoading">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              (click)="sendPasswordReset()"
              [disabled]="forgotLoading || !forgotEmail"
            >
              <span *ngIf="!forgotLoading">Send Reset Link</span>
              <span *ngIf="forgotLoading">Sending…</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex;
      min-height: 100vh;
      width: 100vw;
      background: var(--vamo-bg-base);
      overflow-x: hidden;
    }

    /* Left Hero Panel */
    .login-hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 60px 80px;
      background: var(--vamo-gradient-bg);
      border-right: 1px solid var(--vamo-border-glass);
      position: relative;
    }

    .hero-content {
      max-width: 560px;
      display: flex;
      flex-direction: column;
      gap: 36px;
    }

    .hero-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .hero-logo {
      height: 40px;
      width: auto;
    }

    .hero-brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .hero-name {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .hero-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--vamo-pink);
      letter-spacing: 0.14em;
    }

    .hero-title {
      font-size: 2.2rem;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 16px;
    }

    .hero-description {
      font-size: 1.05rem;
      line-height: 1.6;
      color: var(--vamo-text-secondary);
      margin-bottom: 32px;
    }

    .hero-features {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .feature-item {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .feature-icon {
      color: var(--vamo-pink);
      font-size: 1rem;
      margin-top: 2px;
    }

    .feature-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .feature-text strong {
      font-size: 0.94rem;
      font-weight: 700;
      color: #ffffff;
    }

    .feature-text span {
      font-size: 0.85rem;
      color: var(--vamo-text-muted);
      line-height: 1.4;
    }

    .hero-footer {
      font-size: 0.8rem;
      color: var(--vamo-text-dim);
    }

    /* Right Login Panel */
    .login-panel {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 60px;
      background: var(--vamo-background);
    }

    .login-card {
      width: 100%;
      max-width: 440px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      padding: 36px;
      box-shadow: var(--vamo-shadow-md);
    }

    .login-card-header {
      margin-bottom: 24px;
    }

    .card-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin-bottom: 6px;
    }

    .card-subtitle {
      font-size: 0.88rem;
      color: var(--vamo-text-muted);
    }

    .alert-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 18px;
    }

    .alert-error {
      background: var(--vamo-status-error-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }

    .alert-success {
      background: var(--vamo-status-published-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }

    .password-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .forgot-link {
      background: transparent;
      border: none;
      color: var(--vamo-pink);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }

    .forgot-link:hover {
      text-decoration: underline;
    }

    .submit-btn {
      width: 100%;
      padding: 12px;
      font-size: 0.95rem;
      margin-top: 8px;
    }

    .spinner-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #ffffff;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: var(--vamo-text-dim);
      font-size: 0.75rem;
      margin: 20px 0;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid var(--vamo-border-glass);
    }

    .divider span {
      padding: 0 10px;
    }

    .password-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    .password-input {
      padding-right: 44px !important;
    }

    .password-toggle-btn {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--vamo-text-dim);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      transition: color 0.15s ease;
    }

    .password-toggle-btn:hover {
      color: #ffffff;
    }

    .password-toggle-btn:focus-visible {
      outline: 2px solid var(--vamo-pink);
      outline-offset: 1px;
    }

    .social-btn-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .social-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .google-btn {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      color: var(--vamo-text);
    }

    .google-btn:hover:not(:disabled) {
      background: var(--vamo-surface-hover);
      border-color: var(--vamo-border-hover);
    }

    .apple-btn {
      background: #000000;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    .apple-btn:hover:not(:disabled) {
      background: #111111;
      border-color: rgba(255, 255, 255, 0.4);
    }

    .apple-error-toast {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.82rem;
      margin-top: 10px;
      text-align: center;
    }

    .card-footer-info {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--vamo-border-glass);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
      color: var(--vamo-text-muted);
    }

    .signup-link {
      color: var(--vamo-pink);
      text-decoration: none;
      font-weight: 600;
    }

    .signup-link:hover {
      text-decoration: underline;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .modal-card {
      width: 100%;
      max-width: 440px;
      background: var(--vamo-bg-card);
      border: 1px solid var(--vamo-border-glass-strong);
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 4px;
    }

    .modal-subtitle {
      font-size: 0.84rem;
      color: var(--vamo-text-muted);
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--vamo-text-muted);
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
      padding: 4px;
    }

    .modal-close-btn:hover {
      color: #ffffff;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }

    @media (max-width: 1023px) {
      .login-page {
        flex-direction: column;
      }
      .login-hero {
        padding: 40px 24px;
        border-right: none;
        border-bottom: 1px solid var(--vamo-border-glass);
      }
      .hero-title {
        font-size: 1.6rem;
      }
      .login-panel {
        padding: 32px 20px 48px;
      }
      .login-card {
        padding: 24px;
      }
    }
  `],
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  private customerErrorService = inject(CustomerErrorService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  currentYear = new Date().getFullYear();

  googleLoginEnabled = environment.googleLoginEnabled;

  showForgotModal = false;
  forgotEmail = '';
  forgotLoading = false;
  forgotError = '';

  private returnUrl = '/app/overview';

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app/overview';
  }

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) return;

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const user = await this.authService.login(this.email.trim(), this.password);

      // Check if user has provider_link
      if (user.provider_link && user.provider_link.id) {
        await this.router.navigateByUrl(this.returnUrl);
      } else {
        await this.router.navigate(['/no-business']);
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.extensions?.code;
      if (code === 'INVALID_CREDENTIALS') {
        this.errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else {
        this.errorMessage = this.customerErrorService.toCustomerMessage(err, 'auth');
      }
    } finally {
      this.loading = false;
    }
  }

  openForgotModal(): void {
    this.forgotEmail = this.email;
    this.forgotError = '';
    this.showForgotModal = true;
  }

  closeForgotModal(): void {
    this.showForgotModal = false;
  }

  async sendPasswordReset(): Promise<void> {
    if (!this.forgotEmail) return;

    this.forgotLoading = true;
    this.forgotError = '';

    try {
      await this.authService.requestPasswordReset(this.forgotEmail.trim());
      this.showForgotModal = false;
      this.successMessage = `A password reset link has been dispatched to ${this.forgotEmail}. Please check your inbox.`;
    } catch (err: any) {
      this.forgotError = this.customerErrorService.toCustomerMessage(err, 'save', 'Could not dispatch password reset link. Please check the email address.');
    } finally {
      this.forgotLoading = false;
    }
  }

  showPassword = false;
  appleLoginNotice = '';

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onGoogleLogin(): void {
    this.loading = true;
    this.errorMessage = '';
    this.authService.loginWithProvider('google', this.returnUrl);
  }

  onAppleLogin(): void {
    this.loading = true;
    this.errorMessage = '';
    this.authService.loginWithProvider('apple', this.returnUrl);
  }
}
