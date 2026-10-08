import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { VamoUser } from '../../../core/models/user.model';
import { googleAuthErrorKey } from '../../../core/utils/google-auth-error';
import { GoogleSignInButtonComponent } from '../../../shared/components/google-sign-in-button/google-sign-in-button.component';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSelectorComponent } from '../../../core/i18n/language-selector.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, LanguageSelectorComponent, GoogleSignInButtonComponent],
  template: `
    <div class="register-page">
      <!-- Left Hero Panel: Dark Branded VAMO Presentation -->
      <aside class="register-hero">
        <div class="hero-glow-ambient" aria-hidden="true"></div>

        <div class="hero-content">
          <!-- VAMO Business Portal Branding -->
          <div class="hero-brand">
            <img src="/assets/vamo-logo.png" alt="VAMO" class="hero-logo" onerror="this.style.display='none'" />
            <div class="hero-brand-text">
              <span class="hero-name">VAMO</span>
              <span class="hero-tag">{{ 'PORTAL.BRAND.TAG' | translate }}</span>
            </div>
          </div>

          <!-- Hero Headline & Supporting Copy -->
          <div class="hero-body">
            <h1 class="hero-title">{{ 'PORTAL.REGISTER.HERO_TITLE' | translate }}</h1>
            <p class="hero-description">
              {{ 'PORTAL.REGISTER.HERO_DESC' | translate }}
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
                  <strong>{{ 'PORTAL.REGISTER.FEAT_1_TITLE' | translate }}</strong>
                  <span>{{ 'PORTAL.REGISTER.FEAT_1_DESC' | translate }}</span>
                </div>
              </div>

              <div class="feature-item">
                <div class="feature-icon-wrap" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div class="feature-text">
                  <strong>{{ 'PORTAL.REGISTER.FEAT_2_TITLE' | translate }}</strong>
                  <span>{{ 'PORTAL.REGISTER.FEAT_2_DESC' | translate }}</span>
                </div>
              </div>

              <div class="feature-item">
                <div class="feature-icon-wrap" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div class="feature-text">
                  <strong>{{ 'PORTAL.REGISTER.FEAT_3_TITLE' | translate }}</strong>
                  <span>{{ 'PORTAL.REGISTER.FEAT_3_DESC' | translate }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Left Footer -->
          <footer class="hero-footer">
            <span>© {{ currentYear }} VAMO. {{ 'PORTAL.LOGIN.ALL_RIGHTS' | translate }}</span>
          </footer>
        </div>
      </aside>

      <!-- Right Panel: Clean Light Authentication Card -->
      <main class="register-panel">
        <div class="register-card">
          <div class="card-top-actions">
            <app-language-selector></app-language-selector>
          </div>

          <header class="register-card-header">
            <h2 class="card-title">{{ 'PORTAL.REGISTER.CARD_TITLE' | translate }}</h2>
            <p class="card-subtitle">{{ 'PORTAL.REGISTER.CARD_SUB' | translate }}</p>
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

          <!-- Duplicate Email Notice -->
          <div *ngIf="emailTaken" class="alert-box alert-warning" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div class="warning-text">
              <span>{{ 'ONBOARDING.ERROR_EMAIL_TAKEN' | translate }}</span>
              <a routerLink="/login" class="warning-link">{{ 'ONBOARDING.ERROR_EMAIL_TAKEN_LOGIN' | translate }} &rarr;</a>
            </div>
          </div>

          <!-- Registration Form -->
          <form (ngSubmit)="onSubmit()" #registerForm="ngForm" class="register-form">
            <!-- First and Last Name Row -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="firstName" class="form-label">{{ 'ONBOARDING.FIRST_NAME' | translate }} *</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  [(ngModel)]="firstName"
                  required
                  (blur)="touch('firstName')"
                  class="form-input"
                  placeholder="Juan"
                  autocomplete="given-name"
                  [disabled]="loading"
                />
                <p *ngIf="touched.firstName && !firstName.trim()" class="field-error">
                  {{ 'ONBOARDING.ERROR_FIRST_NAME_REQUIRED' | translate }}
                </p>
              </div>

              <div class="form-group flex-1">
                <label for="lastName" class="form-label">{{ 'ONBOARDING.LAST_NAME' | translate }} *</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  [(ngModel)]="lastName"
                  required
                  (blur)="touch('lastName')"
                  class="form-input"
                  placeholder="Pérez"
                  autocomplete="family-name"
                  [disabled]="loading"
                />
                <p *ngIf="touched.lastName && !lastName.trim()" class="field-error">
                  {{ 'ONBOARDING.ERROR_LAST_NAME_REQUIRED' | translate }}
                </p>
              </div>
            </div>

            <!-- Email Address -->
            <div class="form-group">
              <label for="email" class="form-label">{{ 'ONBOARDING.EMAIL' | translate }} *</label>
              <input
                type="email"
                id="email"
                name="email"
                [(ngModel)]="email"
                required
                email
                (blur)="touch('email')"
                class="form-input"
                placeholder="operator@yourbusiness.com"
                autocomplete="email"
                inputmode="email"
                [disabled]="loading"
              />
              <p *ngIf="touched.email && !email.trim()" class="field-error">
                {{ 'ONBOARDING.ERROR_EMAIL_REQUIRED' | translate }}
              </p>
              <p *ngIf="touched.email && email.trim() && !isEmailValid()" class="field-error">
                {{ 'ONBOARDING.ERROR_EMAIL_INVALID' | translate }}
              </p>
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="password" class="form-label">{{ 'ONBOARDING.PASSWORD' | translate }} *</label>
              <div class="password-input-wrapper">
                <input
                  [type]="showPassword ? 'text' : 'password'"
                  id="password"
                  name="password"
                  [(ngModel)]="password"
                  required
                  minlength="6"
                  (blur)="touch('password')"
                  class="form-input password-input"
                  placeholder="••••••••••••"
                  autocomplete="new-password"
                  [disabled]="loading"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="(showPassword ? 'PORTAL.LOGIN.HIDE_PASSWORD' : 'PORTAL.LOGIN.SHOW_PASSWORD') | translate"
                  tabindex="0"
                >
                  <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
              <p *ngIf="touched.password && password.length < 6" class="field-error">
                {{ 'ONBOARDING.ERROR_PASSWORD_MIN_LENGTH' | translate }}
              </p>
            </div>

            <!-- Confirm Password -->
            <div class="form-group">
              <label for="confirmPassword" class="form-label">{{ 'ONBOARDING.CONFIRM_PASSWORD' | translate }} *</label>
              <div class="password-input-wrapper">
                <input
                  [type]="showConfirmPassword ? 'text' : 'password'"
                  id="confirmPassword"
                  name="confirmPassword"
                  [(ngModel)]="confirmPassword"
                  required
                  (blur)="touch('confirmPassword')"
                  class="form-input password-input"
                  placeholder="••••••••••••"
                  autocomplete="new-password"
                  [disabled]="loading"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  (click)="toggleConfirmPasswordVisibility()"
                  [attr.aria-label]="(showConfirmPassword ? 'PORTAL.LOGIN.HIDE_PASSWORD' : 'PORTAL.LOGIN.SHOW_PASSWORD') | translate"
                  tabindex="0"
                >
                  <svg *ngIf="showConfirmPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <svg *ngIf="!showConfirmPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
              <p *ngIf="touched.confirmPassword && !confirmPassword.trim()" class="field-error">
                {{ 'ONBOARDING.ERROR_CONFIRM_PASSWORD_REQUIRED' | translate }}
              </p>
              <p *ngIf="touched.confirmPassword && confirmPassword && password !== confirmPassword" class="field-error">
                {{ 'ONBOARDING.ERROR_PASSWORD_MISMATCH' | translate }}
              </p>
            </div>

            <!-- Terms and Privacy Checkbox -->
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  name="agreedToTerms"
                  [(ngModel)]="agreedToTerms"
                  (change)="touch('agreedToTerms')"
                  [disabled]="loading"
                />
                <span class="checkbox-custom"></span>
                <span class="terms-text">
                  {{ 'ONBOARDING.TERMS_AGREE_PRE' | translate }}
                  <a href="https://vamo-app.com/terms" target="_blank" rel="noopener noreferrer">{{ 'ONBOARDING.TERMS_OF_USE' | translate }}</a>
                  {{ 'ONBOARDING.TERMS_AGREE_AND' | translate }}
                  <a href="https://vamo-app.com/privacy" target="_blank" rel="noopener noreferrer">{{ 'ONBOARDING.PRIVACY_POLICY' | translate }}</a>.
                </span>
              </label>
              <p *ngIf="touched.agreedToTerms && !agreedToTerms" class="field-error">
                {{ 'ONBOARDING.ERROR_TERMS_REQUIRED' | translate }}
              </p>
            </div>

            <button
              type="submit"
              class="btn btn-primary submit-btn"
              [disabled]="loading || !isFormValid()"
            >
              <span *ngIf="!loading">{{ 'AUTH.REGISTER_BTN' | translate }}</span>
              <span *ngIf="loading" class="spinner-content">
                <span class="spinner"></span>
                <span>{{ 'PORTAL.REGISTER.CREATING_ACCOUNT' | translate }}</span>
              </span>
            </button>
          </form>

          <!-- Social Registration Section -->
          <div class="sso-section">
            <div class="divider"><span>{{ 'AUTH.OR_CONTINUE_WITH' | translate | uppercase }}</span></div>
            <div class="social-btn-stack">
              <app-google-sign-in-button
                [disabled]="loading"
                (credential)="onGoogleCredentialSuccess($event)"
                (fallback)="onGoogleSignUp()"
                (failed)="handleGoogleError($event)"
              ></app-google-sign-in-button>
            </div>
          </div>

          <div class="signup-prompt">
            <span class="signup-prompt-text">{{ 'PORTAL.REGISTER.ALREADY_HAVE_ACCOUNT' | translate }}</span>
            <a routerLink="/login" class="signup-link">
              {{ 'PORTAL.REGISTER.LOG_IN_LINK' | translate }}
            </a>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .register-page {
      display: flex;
      min-height: 100vh;
      width: 100vw;
      background: #f8fafc;
      overflow-x: hidden;
    }

    /* ── Left Hero Panel: Dark Branded Presentation ────────────── */
    .register-hero {
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
      top: -20%;
      left: -20%;
      width: 140%;
      height: 140%;
      background: radial-gradient(circle at 30% 30%, rgba(236, 72, 153, 0.12) 0%, transparent 60%),
                  radial-gradient(circle at 70% 70%, rgba(124, 58, 237, 0.08) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 36px;
    }

    .hero-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .hero-logo {
      height: 38px;
      width: auto;
    }

    .hero-brand-text {
      display: flex;
      flex-direction: column;
    }

    .hero-name {
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #ffffff;
      line-height: 1.1;
    }

    .hero-tag {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: var(--vamo-pink, #ec4899);
    }

    .hero-body {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .hero-title {
      font-size: 2.2rem;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin: 0;
    }

    .hero-description {
      font-size: 1rem;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0;
    }

    .hero-features {
      display: flex;
      flex-direction: column;
      gap: 18px;
      margin-top: 10px;
    }

    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }

    .feature-icon-wrap {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(236, 72, 153, 0.12);
      border: 1px solid rgba(236, 72, 153, 0.25);
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
      gap: 2px;
    }

    .feature-text strong {
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #f1f5f9;
    }

    .feature-text span {
      font-size: 0.84rem;
      color: #94a3b8;
      line-height: 1.45;
    }

    .hero-footer {
      font-size: 0.8rem;
      color: #475569;
      margin-top: 4px;
    }

    /* ── Right Auth Panel: Clean Light Presentation ────────────── */
    .register-panel {
      flex: 1 1 50%;
      min-width: 440px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      background: #f8fafc;
      box-sizing: border-box;
    }

    .register-card {
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
      position: relative;
    }

    .card-top-actions {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 12px;
    }

    .register-card-header {
      margin-bottom: 24px;
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

    .alert-warning {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #b45309;
    }

    .warning-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .warning-link {
      color: var(--vamo-pink, #ec4899);
      font-weight: 600;
      text-decoration: underline;
    }

    /* Form & Inputs */
    .register-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: flex;
      gap: 12px;
    }

    .flex-1 {
      flex: 1;
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

    .field-error {
      font-size: 0.76rem;
      color: #dc2626;
      margin: 2px 0 0;
      font-weight: 500;
    }

    .form-input {
      width: 100%;
      height: 42px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      color: #0f172a;
      font-size: 0.9rem;
      transition: all 0.15s ease;
      box-sizing: border-box;
      font-family: inherit;
    }

    .form-input:focus {
      background: #ffffff;
      outline: none;
      border-color: var(--vamo-pink, #ec4899);
      box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15);
    }

    .form-input::placeholder {
      color: #94a3b8;
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
    }

    .password-input {
      padding-right: 44px;
    }

    .password-toggle-btn {
      position: absolute;
      right: 12px;
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }

    .password-toggle-btn:hover {
      color: #0f172a;
    }

    .checkbox-group {
      margin-top: 2px;
    }

    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      font-size: 0.84rem;
      color: #334155;
      user-select: none;
      line-height: 1.45;
    }

    .checkbox-label input[type="checkbox"] {
      margin-top: 3px;
      width: 16px;
      height: 16px;
      accent-color: var(--vamo-pink, #ec4899);
      cursor: pointer;
    }

    .terms-text a {
      color: var(--vamo-pink, #ec4899);
      text-decoration: underline;
      font-weight: 600;
    }

    /* Buttons */
    .submit-btn {
      width: 100%;
      height: 44px;
      font-size: 0.95rem;
      font-weight: 700;
      margin-top: 4px;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--vamo-pink, #ec4899), #db2777);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.25);
    }

    .btn-primary:hover:not(:disabled) {
      opacity: 0.95;
      box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);
      transform: translateY(-1px);
    }

    .btn-primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
    }

    .spinner-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* SSO Section */
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
      margin-bottom: 16px;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #e2e8f0;
    }

    .divider span {
      padding: 0 10px;
    }

    .social-btn-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .social-btn {
      width: 100%;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      color: #0f172a;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .social-btn:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #94a3b8;
    }

    .social-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    /* Bottom Prompt */
    .signup-prompt {
      margin-top: 22px;
      text-align: center;
      font-size: 0.86rem;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .signup-link {
      color: var(--vamo-pink, #ec4899);
      font-weight: 600;
      text-decoration: underline;
    }

    .signup-link:hover {
      color: #be185d;
    }

    @media (max-width: 960px) {
      .register-hero {
        display: none;
      }
      .register-panel {
        padding: 24px 16px;
      }
      .register-card {
        padding: 32px 24px;
      }
    }
  `],
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private customerErrorService = inject(CustomerErrorService);
  private router = inject(Router);
  private i18n = inject(I18nService);

  currentYear = new Date().getFullYear();

  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  agreedToTerms = true;

  showPassword = false;
  showConfirmPassword = false;
  loading = false;
  errorMessage = '';
  emailTaken = false;

  touched = {
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirmPassword: false,
    agreedToTerms: false,
  };

  ngOnInit(): void {
    // Component initialization
  }

  touch(field: keyof typeof this.touched): void {
    this.touched[field] = true;
    if (field === 'email') {
      this.emailTaken = false;
    }
  }

  isEmailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  isFormValid(): boolean {
    return !!(
      this.firstName.trim() &&
      this.lastName.trim() &&
      this.email.trim() &&
      this.isEmailValid() &&
      this.password.length >= 6 &&
      this.password === this.confirmPassword &&
      this.agreedToTerms
    );
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  async onSubmit(): Promise<void> {
    this.touched.firstName = true;
    this.touched.lastName = true;
    this.touched.email = true;
    this.touched.password = true;
    this.touched.confirmPassword = true;
    this.touched.agreedToTerms = true;

    if (!this.isFormValid() || this.loading) return;

    this.loading = true;
    this.errorMessage = '';
    this.emailTaken = false;

    try {
      await this.authService.register({
        first_name: this.firstName.trim(),
        last_name: this.lastName.trim(),
        email: this.email.trim(),
        password: this.password,
      });

      // Login immediately following successful account creation matching canonical VAMO
      const user = await this.authService.login(this.email.trim(), this.password);

      // Route downstream based on business status
      if (user?.provider_link && user.provider_link.id) {
        await this.router.navigateByUrl('/app/overview');
      } else {
        await this.router.navigate(['/no-business']);
      }
    } catch (err: any) {
      if (this.isEmailTakenError(err)) {
        this.emailTaken = true;
      } else {
        this.errorMessage = this.customerErrorService.toCustomerMessage(err, 'auth');
      }
    } finally {
      this.loading = false;
    }
  }

  async onGoogleSignUp(): Promise<void> {
    await this.completeGoogleSignUp(() => this.authService.loginWithGoogle());
  }

  async onGoogleCredentialSuccess(credential: string): Promise<void> {
    await this.completeGoogleSignUp(() => this.authService.loginWithGoogleCredential(credential));
  }

  private async completeGoogleSignUp(authenticate: () => Promise<VamoUser>): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      const user = await authenticate();
      if (user?.provider_link?.id) {
        await this.router.navigateByUrl('/app/overview');
      } else {
        await this.router.navigate(['/no-business']);
      }
    } catch (err) {
      this.handleGoogleError(err);
    } finally {
      this.loading = false;
    }
  }

  handleGoogleError(err: unknown): void {
    this.errorMessage = this.i18n.t(googleAuthErrorKey(err));
  }

  onAppleSignUp(): void {
    this.loading = true;
    this.errorMessage = '';
    this.authService.loginWithProvider('apple', '/app/overview');
  }

  private isEmailTakenError(err: any): boolean {
    const code = err?.errors?.[0]?.extensions?.code ?? '';
    const msg = (err?.errors?.[0]?.message ?? err?.message ?? '').toLowerCase();
    return (
      code === 'RECORD_NOT_UNIQUE' ||
      msg.includes('unique') ||
      msg.includes('already exist') ||
      msg.includes('already registered') ||
      msg.includes('email already taken')
    );
  }
}
