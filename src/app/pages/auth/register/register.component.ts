import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="register-page">
      <!-- Left Hero Panel: Value Statement & VAMO Branding -->
      <div class="register-hero">
        <div class="hero-content">
          <div class="hero-brand">
            <img src="/assets/vamo-logo.png" alt="VAMO" class="hero-logo" onerror="this.style.display='none'" />
            <div class="hero-brand-text">
              <span class="hero-name">VAMO</span>
              <span class="hero-tag">BUSINESS PORTAL</span>
            </div>
          </div>

          <div class="hero-body">
            <h1 class="hero-title">Create your VAMO account.</h1>
            <p class="hero-description">
              Join local businesses and event organizers across the Dominican Republic. Manage your business profile, post events, and reach travelers and locals.
            </p>

            <div class="hero-features">
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Manage Profile & Events</strong>
                  <span>Publish listings, update hours, and showcase your venue.</span>
                </div>
              </div>
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Discovery Network</strong>
                  <span>Directly connected to the VAMO discovery mobile app.</span>
                </div>
              </div>
              <div class="feature-item">
                <span class="feature-icon">✦</span>
                <div class="feature-text">
                  <strong>Verified Business Ownership</strong>
                  <span>Secure account association for verified business operators.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="hero-footer">
            <span>© {{ currentYear }} VAMO. All rights reserved.</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Registration Form -->
      <div class="register-panel">
        <div class="register-card">
          <div class="register-card-header">
            <h2 class="card-title">Create your account</h2>
            <p class="card-subtitle">Enter your details to register on VAMO</p>
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

          <!-- Duplicate Email Notice -->
          <div *ngIf="emailTaken" class="alert-box alert-warning" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div class="warning-text">
              <span>This email address is already registered.</span>
              <a routerLink="/login" class="warning-link">Log in instead →</a>
            </div>
          </div>

          <!-- Registration Form -->
          <form (ngSubmit)="onSubmit()" #registerForm="ngForm" class="register-form">
            <!-- First and Last Name Row -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="firstName" class="form-label">First name *</label>
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
                  First name is required
                </p>
              </div>

              <div class="form-group flex-1">
                <label for="lastName" class="form-label">Last name *</label>
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
                  Last name is required
                </p>
              </div>
            </div>

            <!-- Email Address -->
            <div class="form-group">
              <label for="email" class="form-label">Email address *</label>
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
                Email address is required
              </p>
              <p *ngIf="touched.email && email.trim() && !isEmailValid()" class="field-error">
                Please enter a valid email address
              </p>
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="password" class="form-label">Password *</label>
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
                  placeholder="At least 6 characters"
                  autocomplete="new-password"
                  [disabled]="loading"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'"
                  tabindex="0"
                >
                  <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
              <p *ngIf="touched.password && password.length < 6" class="field-error">
                Password must be at least 6 characters
              </p>
            </div>

            <!-- Confirm Password -->
            <div class="form-group">
              <label for="confirmPassword" class="form-label">Confirm password *</label>
              <div class="password-input-wrapper">
                <input
                  [type]="showConfirmPassword ? 'text' : 'password'"
                  id="confirmPassword"
                  name="confirmPassword"
                  [(ngModel)]="confirmPassword"
                  required
                  (blur)="touch('confirmPassword')"
                  class="form-input password-input"
                  placeholder="Repeat your password"
                  autocomplete="new-password"
                  [disabled]="loading"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  (click)="toggleConfirmPasswordVisibility()"
                  [attr.aria-label]="showConfirmPassword ? 'Hide password' : 'Show password'"
                  tabindex="0"
                >
                  <svg *ngIf="showConfirmPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  <svg *ngIf="!showConfirmPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>
              <p *ngIf="touched.confirmPassword && !confirmPassword.trim()" class="field-error">
                Confirm password is required
              </p>
              <p *ngIf="touched.confirmPassword && confirmPassword && password !== confirmPassword" class="field-error">
                Passwords do not match
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
                  I have read and agree to the
                  <a href="https://vamo-app.com/terms" target="_blank" rel="noopener noreferrer">Terms of Use</a>
                  and
                  <a href="https://vamo-app.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                </span>
              </label>
              <p *ngIf="touched.agreedToTerms && !agreedToTerms" class="field-error">
                You must agree to the Terms of Use and Privacy Policy to continue.
              </p>
            </div>

            <button
              type="submit"
              class="btn btn-primary submit-btn"
              [disabled]="loading || !isFormValid()"
            >
              <span *ngIf="!loading">Register</span>
              <span *ngIf="loading" class="spinner-content">
                <span class="spinner"></span>
                <span>Creating account…</span>
              </span>
            </button>
          </form>

          <!-- Social Registration Section -->
          <div class="sso-section">
            <div class="divider"><span>OR</span></div>
            <div class="social-btn-stack">
              <button type="button" class="btn btn-secondary social-btn google-btn" (click)="onGoogleSignUp()" [disabled]="loading">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          </div>

          <div class="card-footer-info">
            <span>Already have an account?</span>
            <a routerLink="/login" class="login-link">
              Log in here →
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .register-page {
      display: flex;
      min-height: 100vh;
      width: 100vw;
      background: var(--vamo-bg-base);
      color: #ffffff;
      font-family: var(--vamo-font-sans, system-ui, -apple-system, sans-serif);
    }

    .register-hero {
      flex: 1.1;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9)),
                  radial-gradient(ellipse at 20% 40%, rgba(236, 72, 153, 0.25) 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 80%, rgba(249, 115, 22, 0.2) 0%, transparent 60%);
      padding: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      border-right: 1px solid var(--vamo-border-glass);
    }

    .hero-content {
      max-width: 520px;
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
    }

    .hero-name {
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #ffffff, #f472b6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-tag {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--vamo-text-muted, #94a3b8);
    }

    .hero-title {
      font-size: 2.2rem;
      font-weight: 800;
      line-height: 1.2;
      color: #ffffff;
      margin: 0 0 16px;
    }

    .hero-description {
      font-size: 1rem;
      line-height: 1.6;
      color: #cbd5e1;
      margin: 0;
    }

    .hero-features {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .feature-icon {
      color: var(--vamo-pink, #ec4899);
      font-size: 1.1rem;
      margin-top: 2px;
    }

    .feature-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .feature-text strong {
      font-size: 0.95rem;
      color: #ffffff;
    }

    .feature-text span {
      font-size: 0.85rem;
      color: #94a3b8;
    }

    .hero-footer {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: auto;
    }

    .register-panel {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 30px;
      overflow-y: auto;
    }

    .register-card {
      width: 100%;
      max-width: 440px;
      background: var(--vamo-bg-card, rgba(30, 41, 59, 0.7));
      backdrop-filter: blur(12px);
      border: 1px solid var(--vamo-border-glass, rgba(255, 255, 255, 0.1));
      border-radius: 16px;
      padding: 36px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }

    .register-card-header {
      margin-bottom: 24px;
    }

    .card-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 6px;
    }

    .card-subtitle {
      font-size: 0.88rem;
      color: var(--vamo-text-muted, #94a3b8);
      margin: 0;
    }

    .alert-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 0.88rem;
      margin-bottom: 18px;
      line-height: 1.4;
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }

    .alert-warning {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fcd34d;
    }

    .warning-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .warning-link {
      color: #ffffff;
      font-weight: 600;
      text-decoration: underline;
    }

    .form-row {
      display: flex;
      gap: 12px;
    }

    .flex-1 {
      flex: 1;
    }

    .register-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: #e2e8f0;
    }

    .field-error {
      font-size: 0.75rem;
      color: #fca5a5;
      margin: 2px 0 0;
    }

    .form-input {
      width: 100%;
      height: 42px;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--vamo-border-glass, rgba(255, 255, 255, 0.15));
      border-radius: 8px;
      color: #ffffff;
      font-size: 0.9rem;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--vamo-pink, #ec4899);
      box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.25);
    }

    .form-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .password-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .password-input {
      padding-right: 40px;
    }

    .password-toggle-btn {
      position: absolute;
      right: 10px;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .password-toggle-btn:hover {
      color: #ffffff;
    }

    .checkbox-group {
      margin-top: 4px;
    }

    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }

    .checkbox-label input[type="checkbox"] {
      margin-top: 3px;
      accent-color: var(--vamo-pink, #ec4899);
      cursor: pointer;
    }

    .terms-text {
      font-size: 0.8rem;
      color: #cbd5e1;
      line-height: 1.4;
    }

    .terms-text a {
      color: var(--vamo-pink, #ec4899);
      text-decoration: underline;
    }

    .submit-btn {
      height: 44px;
      border-radius: 8px;
      border: none;
      background: var(--vamo-pink, #ec4899);
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s ease;
      margin-top: 8px;
    }

    .submit-btn:hover:not(:disabled) {
      opacity: 0.9;
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .sso-section {
      margin-top: 20px;
    }

    .divider {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--vamo-border-glass, rgba(255, 255, 255, 0.1));
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
      height: 42px;
      border-radius: 8px;
      border: 1px solid var(--vamo-border-glass, rgba(255, 255, 255, 0.15));
      background: rgba(15, 23, 42, 0.5);
      color: #ffffff;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: background 0.15s ease;
    }

    .social-btn:hover:not(:disabled) {
      background: rgba(30, 41, 59, 0.8);
    }

    .social-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .card-footer-info {
      margin-top: 24px;
      text-align: center;
      font-size: 0.85rem;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .login-link {
      color: var(--vamo-pink, #ec4899);
      font-weight: 600;
      text-decoration: none;
    }

    .login-link:hover {
      text-decoration: underline;
    }

    @media (max-width: 900px) {
      .register-hero {
        display: none;
      }
      .register-panel {
        padding: 20px;
      }
    }
  `],
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private customerErrorService = inject(CustomerErrorService);
  private router = inject(Router);

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

  onGoogleSignUp(): void {
    this.errorMessage = '';
    this.authService.loginWithProvider('google', '/app/overview');
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
