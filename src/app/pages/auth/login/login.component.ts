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
      <!-- Left Hero Panel: Dark Branded VAMO Presentation -->
      <aside class="login-hero">
        <div class="hero-glow-ambient" aria-hidden="true"></div>

        <div class="hero-content">
          <!-- VAMO Business Portal Branding -->
          <div class="hero-brand">
            <img src="/assets/vamo-logo.png" alt="VAMO" class="hero-logo" onerror="this.style.display='none'" />
            <div class="hero-brand-text">
              <span class="hero-name">VAMO</span>
              <span class="hero-tag">BUSINESS PORTAL</span>
            </div>
          </div>

          <!-- Hero Headline & Supporting Copy -->
          <div class="hero-body">
            <h1 class="hero-title">Run your VAMO business from one place.</h1>
            <p class="hero-description">
              Manage your profile, events, promotions, and customer reach from one simple dashboard.
            </p>

            <!-- Customer-Facing Benefit Items -->
            <div class="hero-features">
              <div class="feature-item">
                <div class="feature-icon-wrap" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div class="feature-text">
                  <strong>MANAGE EVERYTHING IN ONE PLACE</strong>
                  <span>Update your business profile, events, and promotions.</span>
                </div>
              </div>

              <div class="feature-item">
                <div class="feature-icon-wrap" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div class="feature-text">
                  <strong>STAY SYNCED WITH VAMO</strong>
                  <span>Your changes appear across the VAMO experience.</span>
                </div>
              </div>

              <div class="feature-item">
                <div class="feature-icon-wrap" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div class="feature-text">
                  <strong>REACH MORE CUSTOMERS</strong>
                  <span>Stay visible to locals and travelers looking for things to do.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Subtle Product Interface Preview Card -->
          <div class="hero-preview-card" aria-hidden="true">
            <div class="preview-header">
              <div class="preview-badge">
                <span class="preview-pulse-dot"></span>
                <span>LIVE PLATFORM</span>
              </div>
              <span class="preview-meta-tag">Dominican Republic</span>
            </div>
            <div class="preview-body">
              <div class="preview-title">Your VAMO Business</div>
              <div class="preview-sub">Manage your profile, events, and promotions in one place.</div>
            </div>
          </div>

          <!-- Left Footer -->
          <footer class="hero-footer">
            <span>© {{ currentYear }} VAMO. All rights reserved.</span>
          </footer>
        </div>
      </aside>

      <!-- Right Panel: Clean Light Authentication Card -->
      <main class="login-panel">
        <div class="login-card">
          <header class="login-card-header">
            <h2 class="card-title">Sign in to VAMO</h2>
            <p class="card-subtitle">Manage your business, events, and promotions.</p>
          </header>

          <!-- Error Alert Banner -->
          <div *ngIf="errorMessage" class="alert-box alert-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Success Alert Banner (e.g. Password Reset) -->
          <div *ngIf="successMessage" class="alert-box alert-success" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
                  <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <!-- Eye Icon (visible when showPassword is false) -->
                  <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
            <div class="divider"><span>OR CONTINUE WITH</span></div>
            <div class="social-btn-stack">
              <button type="button" class="btn btn-secondary social-btn google-btn" (click)="onGoogleLogin()" [disabled]="loading">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          </div>

          <!-- Secondary Intentional Registration CTA -->
          <div class="signup-prompt">
            <span class="signup-prompt-text">New to VAMO?</span>
            <a routerLink="/register" class="signup-link">
              Create your business account →
            </a>
          </div>
        </div>
      </main>

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
      background: #f8fafc;
      overflow-x: hidden;
    }

    /* ── Left Hero Panel: Dark Branded Presentation ────────────── */
    .login-hero {
      flex: 1 1 50%;
      min-width: 480px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 64px 60px 48px;
      background: #090d16;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
      overflow: hidden;
      color: #ffffff;
      box-sizing: border-box;
    }

    .hero-glow-ambient {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 18% 22%, rgba(236, 72, 153, 0.16) 0%, transparent 42%),
        radial-gradient(circle at 82% 78%, rgba(139, 92, 246, 0.14) 0%, transparent 46%),
        radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.07) 0%, transparent 52%);
      pointer-events: none;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 480px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 32px;
      width: 100%;
    }

    /* VAMO Prominent Branding */
    .hero-brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .hero-logo {
      height: 44px;
      width: auto;
      filter: drop-shadow(0 2px 8px rgba(236, 72, 153, 0.3));
    }

    .hero-brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .hero-name {
      font-size: 1.7rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .hero-tag {
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--vamo-pink, #ec4899);
      letter-spacing: 0.18em;
      margin-top: 2px;
    }

    /* Hero Typography */
    .hero-body {
      display: flex;
      flex-direction: column;
    }

    .hero-title {
      font-size: 2.35rem;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.025em;
      color: #ffffff;
      margin: 0 0 14px 0;
    }

    .hero-description {
      font-size: 1.02rem;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 28px 0;
    }

    /* Customer-Facing Benefit Items */
    .hero-features {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .feature-item {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .feature-icon-wrap {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: rgba(236, 72, 153, 0.14);
      border: 1px solid rgba(236, 72, 153, 0.3);
      color: var(--vamo-pink, #ec4899);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .feature-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .feature-text strong {
      font-size: 0.84rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }

    .feature-text span {
      font-size: 0.88rem;
      color: #cbd5e1;
      line-height: 1.45;
    }

    /* Subtle Product Interface Preview Card */
    .hero-preview-card {
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px 20px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .preview-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.08em;
    }

    .preview-pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
    }

    .preview-meta-tag {
      font-size: 0.74rem;
      color: #64748b;
      font-weight: 500;
    }

    .preview-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .preview-title {
      font-size: 0.94rem;
      font-weight: 700;
      color: #ffffff;
    }

    .preview-sub {
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .hero-footer {
      font-size: 0.8rem;
      color: #475569;
      margin-top: 4px;
    }

    /* ── Right Auth Panel: Clean Light Presentation ────────────── */
    .login-panel {
      flex: 1 1 50%;
      min-width: 440px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      background: #f8fafc;
      box-sizing: border-box;
    }

    .login-card {
      width: 100%;
      max-width: 460px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 40px 36px;
      box-shadow:
        0 10px 25px -5px rgba(15, 23, 42, 0.05),
        0 8px 10px -6px rgba(15, 23, 42, 0.03);
      box-sizing: border-box;
    }

    .login-card-header {
      margin-bottom: 26px;
    }

    .card-title {
      font-size: 1.65rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.025em;
      margin: 0 0 6px 0;
    }

    .card-subtitle {
      font-size: 0.92rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    /* Alert Boxes */
    .alert-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 0.86rem;
      margin-bottom: 20px;
      line-height: 1.4;
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #b91c1c;
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #047857;
    }

    /* Form & Inputs */
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-label {
      font-size: 0.84rem;
      font-weight: 600;
      color: #1e293b;
    }

    .password-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .forgot-link {
      background: transparent;
      border: none;
      color: var(--vamo-pink, #ec4899);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      padding: 0;
      transition: color 0.15s ease;
    }

    .forgot-link:hover:not(:disabled) {
      color: #be185d;
      text-decoration: underline;
    }

    .forgot-link:focus-visible {
      outline: 2px solid var(--vamo-pink, #ec4899);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .form-input {
      width: 100%;
      height: 46px;
      padding: 10px 14px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      color: #0f172a;
      font-size: 0.94rem;
      box-sizing: border-box;
      transition: all 0.15s ease;
    }

    .form-input::placeholder {
      color: #94a3b8;
    }

    .form-input:focus {
      outline: none;
      background: #ffffff;
      border-color: var(--vamo-pink, #ec4899);
      box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.18);
    }

    .form-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background: #f1f5f9;
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
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: #64748b;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      cursor: pointer;
      border-radius: 6px;
      transition: color 0.15s ease;
    }

    .password-toggle-btn:hover {
      color: #0f172a;
    }

    .password-toggle-btn:focus-visible {
      outline: 2px solid var(--vamo-pink, #ec4899);
      outline-offset: 1px;
    }

    /* Primary CTA */
    .submit-btn {
      width: 100%;
      height: 48px;
      margin-top: 6px;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #ec4899 0%, #db2777 40%, #7c3aed 100%);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(236, 72, 153, 0.35);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 22px rgba(236, 72, 153, 0.45);
    }

    .submit-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .submit-btn:focus-visible {
      outline: 2px solid var(--vamo-pink, #ec4899);
      outline-offset: 2px;
    }

    .submit-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }

    .spinner-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-radius: 50%;
      border-top-color: #ffffff;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Single Clean OR Divider */
    .sso-section {
      margin-top: 20px;
    }

    .divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: #94a3b8;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin: 20px 0 16px;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #e2e8f0;
    }

    .divider span {
      padding: 0 12px;
    }

    /* Secondary Social Sign-In Buttons */
    .social-btn-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .social-btn {
      width: 100%;
      height: 44px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .google-btn {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #1e293b;
    }

    .google-btn:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #94a3b8;
    }

    .apple-btn {
      background: #000000;
      border: 1px solid #000000;
      color: #ffffff;
    }

    .apple-btn:hover:not(:disabled) {
      background: #1e293b;
    }

    .social-btn:focus-visible {
      outline: 2px solid var(--vamo-pink, #ec4899);
      outline-offset: 2px;
    }

    .social-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Secondary Registration Action Box */
    .signup-prompt {
      margin-top: 24px;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-sizing: border-box;
    }

    .signup-prompt-text {
      font-size: 0.88rem;
      color: #475569;
      font-weight: 500;
    }

    .signup-link {
      font-size: 0.88rem;
      color: var(--vamo-pink, #ec4899);
      text-decoration: none;
      font-weight: 700;
      transition: color 0.15s ease;
    }

    .signup-link:hover {
      color: #be185d;
      text-decoration: underline;
    }

    .signup-link:focus-visible {
      outline: 2px solid var(--vamo-pink, #ec4899);
      outline-offset: 2px;
      border-radius: 4px;
    }

    /* Forgot Password Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .modal-card {
      width: 100%;
      max-width: 440px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    .modal-title {
      font-size: 1.3rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }

    .modal-subtitle {
      font-size: 0.86rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 0.15s ease;
    }

    .modal-close-btn:hover {
      color: #0f172a;
    }

    .modal-body {
      margin-bottom: 20px;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    /* Responsive Breakpoints */
    @media (max-width: 960px) {
      .login-page {
        flex-direction: column;
      }

      .login-hero {
        min-width: 100%;
        padding: 36px 24px 28px;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .hero-content {
        max-width: 100%;
        gap: 20px;
      }

      .hero-title {
        font-size: 1.8rem;
      }

      .hero-features,
      .hero-preview-card,
      .hero-footer {
        display: none;
      }

      .hero-description {
        margin-bottom: 0;
      }

      .login-panel {
        min-width: 100%;
        padding: 32px 16px 48px;
      }

      .login-card {
        padding: 28px 22px;
        max-width: 100%;
      }

      .signup-prompt {
        flex-direction: column;
        text-align: center;
        gap: 6px;
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
