import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { VamoUser } from '../../core/models/user.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  template: `
    <div class="settings-page">
      <!-- ── Page Header ──────────────────────────────────────────────── -->
      <header class="settings-header">
        <h1 class="page-title">{{ 'PORTAL.SETTINGS.TITLE' | translate }}</h1>
        <p class="page-subtitle">{{ 'PORTAL.SETTINGS.SUBTITLE' | translate }}</p>
      </header>

      <div class="settings-grid">
        <!-- ── 1. User Profile Card ────────────────────────────────────── -->
        <section class="card settings-card" aria-labelledby="profile-heading">
          <div class="card-header">
            <h2 id="profile-heading" class="card-title">
              {{ 'PORTAL.SETTINGS.PROFILE_TITLE' | translate }}
            </h2>
          </div>

          <div class="card-body">
            <!-- Profile Success Status Banner -->
            <div
              *ngIf="profileSaved()"
              class="status-banner banner-success"
              role="status"
              aria-live="polite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{{ 'PORTAL.SETTINGS.SAVED' | translate }}</span>
            </div>

            <!-- Profile Error Banner -->
            <div
              *ngIf="profileError()"
              class="status-banner banner-error"
              role="alert"
              aria-live="polite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{{ profileError() }}</span>
            </div>

            <form (ngSubmit)="saveProfile()" #profileForm="ngForm" novalidate>
              <div class="form-row">
                <!-- First Name Field -->
                <div class="form-group">
                  <label for="settingsFirstName" class="form-label">
                    {{ 'PORTAL.SETTINGS.FIRST_NAME' | translate }}
                    <span class="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="settingsFirstName"
                    name="firstName"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="firstNameTouched() && !isFirstNameValid()"
                    [(ngModel)]="firstName"
                    (blur)="firstNameTouched.set(true)"
                    (input)="onProfileInput()"
                    [disabled]="isSavingProfile()"
                    required
                    autocomplete="given-name"
                  />
                  <span
                    *ngIf="firstNameTouched() && !isFirstNameValid()"
                    class="field-error"
                    role="alert"
                  >
                    {{ 'PORTAL.SETTINGS.VALIDATION_REQUIRED' | translate }}
                  </span>
                </div>

                <!-- Last Name Field -->
                <div class="form-group">
                  <label for="settingsLastName" class="form-label">
                    {{ 'PORTAL.SETTINGS.LAST_NAME' | translate }}
                    <span class="required-star" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="settingsLastName"
                    name="lastName"
                    type="text"
                    class="form-control"
                    [class.is-invalid]="lastNameTouched() && !isLastNameValid()"
                    [(ngModel)]="lastName"
                    (blur)="lastNameTouched.set(true)"
                    (input)="onProfileInput()"
                    [disabled]="isSavingProfile()"
                    required
                    autocomplete="family-name"
                  />
                  <span
                    *ngIf="lastNameTouched() && !isLastNameValid()"
                    class="field-error"
                    role="alert"
                  >
                    {{ 'PORTAL.SETTINGS.VALIDATION_REQUIRED' | translate }}
                  </span>
                </div>
              </div>

              <!-- Email Field -->
              <div class="form-group">
                <label for="settingsEmail" class="form-label">
                  {{ 'PORTAL.SETTINGS.EMAIL' | translate }}
                  <span class="required-star" aria-hidden="true">*</span>
                </label>
                <input
                  id="settingsEmail"
                  name="email"
                  type="email"
                  class="form-control"
                  [class.is-invalid]="emailTouched() && !isEmailValid()"
                  [(ngModel)]="email"
                  (blur)="emailTouched.set(true)"
                  (input)="onProfileInput()"
                  [disabled]="isSavingProfile()"
                  required
                  autocomplete="email"
                />
                <span
                  *ngIf="emailTouched() && !email.trim()"
                  class="field-error"
                  role="alert"
                >
                  {{ 'PORTAL.SETTINGS.VALIDATION_REQUIRED' | translate }}
                </span>
                <span
                  *ngIf="emailTouched() && email.trim() && !isEmailValid()"
                  class="field-error"
                  role="alert"
                >
                  {{ 'PORTAL.SETTINGS.VALIDATION_EMAIL' | translate }}
                </span>
              </div>

              <!-- Action Bar -->
              <div class="card-actions">
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="!canSaveProfile() || isSavingProfile()"
                >
                  <span *ngIf="isSavingProfile()" class="spinner-inline" aria-hidden="true"></span>
                  <span>{{ (isSavingProfile() ? 'PORTAL.SETTINGS.SAVING' : 'PORTAL.SETTINGS.SAVE') | translate }}</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        <!-- ── 2. Password Security Card ───────────────────────────────── -->
        <section class="card settings-card" aria-labelledby="password-heading">
          <div class="card-header">
            <h2 id="password-heading" class="card-title">
              {{ 'PORTAL.SETTINGS.PASSWORD_TITLE' | translate }}
            </h2>
          </div>

          <div class="card-body">
            <div class="password-field-row">
              <label class="form-label" for="passwordPlaceholder">
                {{ 'PORTAL.SETTINGS.PASSWORD_TITLE' | translate }}
              </label>
              <div class="password-masked-display" id="passwordPlaceholder" aria-label="Password hidden">
                ••••••••••••
              </div>
            </div>

            <p class="section-desc">
              {{ 'PORTAL.SETTINGS.PASSWORD_DESC' | translate }}
            </p>

            <!-- Password Reset Success Banner -->
            <div
              *ngIf="passwordSent()"
              class="status-banner banner-success"
              role="status"
              aria-live="polite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{{ 'PORTAL.SETTINGS.PASSWORD_SENT' | translate }}</span>
            </div>

            <!-- Password Reset Error Banner -->
            <div
              *ngIf="passwordError()"
              class="status-banner banner-error"
              role="alert"
              aria-live="polite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{{ passwordError() }}</span>
            </div>

            <div class="card-actions">
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="isSendingPasswordReset()"
                (click)="sendPasswordReset()"
              >
                <span *ngIf="isSendingPasswordReset()" class="spinner-inline" aria-hidden="true"></span>
                <span>{{ 'PORTAL.SETTINGS.PASSWORD_BUTTON' | translate }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ── 3. Danger Zone: Delete Account Card ─────────────────────── -->
        <section class="card settings-card danger-card" aria-labelledby="danger-heading">
          <div class="card-header danger-header">
            <h2 id="danger-heading" class="card-title text-danger">
              {{ 'PORTAL.SETTINGS.DANGER_TITLE' | translate }}
            </h2>
          </div>

          <div class="card-body">
            <div class="danger-action-info">
              <h3 class="danger-title">{{ 'PORTAL.SETTINGS.DELETE_TITLE' | translate }}</h3>
              <p class="section-desc danger-desc">
                {{ 'PORTAL.SETTINGS.DELETE_DESC' | translate }}
              </p>
            </div>

            <div class="card-actions">
              <button
                type="button"
                class="btn btn-danger-outline"
                (click)="openDeleteModal()"
              >
                {{ 'PORTAL.SETTINGS.DELETE_BUTTON' | translate }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- ── Delete Account Confirmation Modal ────────────────────────── -->
      <div
        *ngIf="showDeleteModal()"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        (click)="onBackdropClick($event)"
      >
        <div class="modal-dialog" #modalDialog (click)="$event.stopPropagation()">
          <div class="modal-content card">
            <div class="modal-header">
              <div class="warning-icon-bubble" aria-hidden="true">⚠️</div>
              <h2 id="delete-modal-title" class="modal-title">
                {{ 'PORTAL.SETTINGS.DELETE_MODAL_TITLE' | translate }}
              </h2>
            </div>

            <div class="modal-body">
              <p class="modal-desc">
                {{ 'PORTAL.SETTINGS.DELETE_DESC' | translate }}
              </p>

              <label for="deleteConfirmInput" class="modal-subtext">
                {{ 'PORTAL.SETTINGS.DELETE_CONFIRM_HINT' | translate }}
              </label>

              <input
                #deleteInput
                id="deleteConfirmInput"
                type="text"
                class="form-control delete-confirm-input"
                [(ngModel)]="deleteConfirmText"
                placeholder="DELETE"
                (keydown.enter)="onDeleteEnter($event)"
                [disabled]="isDeletingAccount()"
                autocomplete="off"
                spellcheck="false"
              />

              <!-- Deletion Error Notice inside modal -->
              <div
                *ngIf="deleteError()"
                class="status-banner banner-error modal-error"
                role="alert"
                aria-live="polite"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{{ deleteError() }}</span>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="isDeletingAccount()"
                (click)="closeDeleteModal()"
              >
                {{ 'PORTAL.SETTINGS.KEEP_ACCOUNT' | translate }}
              </button>

              <button
                type="button"
                class="btn btn-danger"
                [disabled]="!isDeleteConfirmed() || isDeletingAccount()"
                (click)="confirmDelete()"
              >
                <span *ngIf="isDeletingAccount()" class="spinner-inline" aria-hidden="true"></span>
                <span>{{ (isDeletingAccount() ? 'PORTAL.SETTINGS.DELETING' : 'PORTAL.SETTINGS.DELETE_PERMANENTLY') | translate }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .settings-page {
      display: flex;
      flex-direction: column;
      gap: 28px;
      max-width: 800px;
      padding-bottom: 60px;
    }

    .settings-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .page-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--vamo-text);
      letter-spacing: -0.02em;
      margin: 0;
    }

    .page-subtitle {
      font-size: 0.95rem;
      color: var(--vamo-text-muted);
      margin: 0;
      line-height: 1.5;
    }

    .settings-grid {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .settings-card {
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-sm);
      overflow: hidden;
    }

    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--vamo-border);
      background: var(--vamo-surface);
    }

    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .card-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    @media (max-width: 640px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }

    .form-label {
      font-size: 0.86rem;
      font-weight: 600;
      color: var(--vamo-text);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .required-star {
      color: var(--vamo-secondary);
      font-weight: 700;
    }

    .form-control {
      width: 100%;
      padding: 10px 14px;
      border-radius: var(--vamo-radius-sm);
      border: 1px solid var(--vamo-border);
      background: var(--vamo-surface);
      color: var(--vamo-text);
      font-family: inherit;
      font-size: 0.92rem;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      line-height: 1.5;
      box-sizing: border-box;
    }

    .form-control:focus {
      outline: none;
      border-color: var(--vamo-primary);
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
    }

    .form-control.is-invalid {
      border-color: var(--vamo-error);
    }

    .form-control.is-invalid:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
    }

    .field-error {
      font-size: 0.8rem;
      color: var(--vamo-error);
      font-weight: 500;
      margin-top: 2px;
    }

    .card-actions {
      display: flex;
      justify-content: flex-start;
      margin-top: 8px;
    }

    .section-desc {
      font-size: 0.9rem;
      color: var(--vamo-text-muted);
      line-height: 1.5;
      margin: 0;
    }

    .password-field-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .password-masked-display {
      font-family: monospace;
      letter-spacing: 0.25em;
      font-size: 1rem;
      color: var(--vamo-text-muted);
      padding: 10px 14px;
      background: var(--vamo-surface-subtle);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-sm);
      user-select: none;
      width: fit-content;
      min-width: 180px;
    }

    /* Danger Card */
    .danger-card {
      border-color: rgba(239, 68, 68, 0.3);
    }

    .danger-header {
      background: rgba(239, 68, 68, 0.04);
      border-bottom-color: rgba(239, 68, 68, 0.2);
    }

    .text-danger {
      color: var(--vamo-error);
    }

    .danger-action-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .danger-title {
      font-size: 1.02rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .danger-desc {
      color: var(--vamo-text-muted);
    }

    .btn-danger-outline {
      background: transparent;
      color: var(--vamo-error);
      border: 1px solid var(--vamo-error);
      padding: 8px 18px;
      font-size: 0.88rem;
      font-weight: 600;
      border-radius: var(--vamo-radius-sm);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .btn-danger-outline:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.08);
      border-color: #dc2626;
      color: #dc2626;
    }

    /* Status Banners */
    .status-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: var(--vamo-radius-sm);
      font-size: 0.88rem;
      font-weight: 500;
      line-height: 1.4;
    }

    .status-banner svg {
      flex-shrink: 0;
    }

    .banner-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #065f46;
    }

    .banner-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #991b1b;
    }

    /* Modal Backdrop and Content */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-dialog {
      width: 100%;
      max-width: 480px;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popIn {
      from { transform: scale(0.96); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-content {
      padding: 24px;
      background: var(--vamo-surface);
      border: 1px solid var(--vamo-border);
      border-radius: var(--vamo-radius-md);
      box-shadow: var(--vamo-shadow-lg);
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .warning-icon-bubble {
      width: 40px;
      height: 40px;
      border-radius: var(--vamo-radius-full);
      background: rgba(239, 68, 68, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .modal-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--vamo-text);
      margin: 0;
    }

    .modal-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .modal-desc {
      font-size: 0.92rem;
      color: var(--vamo-text);
      line-height: 1.5;
      margin: 0;
    }

    .modal-subtext {
      font-size: 0.86rem;
      font-weight: 600;
      color: var(--vamo-text-muted);
      margin: 4px 0 0;
      display: block;
    }

    .delete-confirm-input {
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .modal-error {
      margin-top: 4px;
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }

    .spinner-inline {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class SettingsComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18nService);

  @ViewChild('deleteInput') deleteInputRef?: ElementRef<HTMLInputElement>;

  // Profile Form state
  firstName = '';
  lastName = '';
  email = '';

  private originalFirstName = '';
  private originalLastName = '';
  private originalEmail = '';

  firstNameTouched = signal(false);
  lastNameTouched = signal(false);
  emailTouched = signal(false);

  isSavingProfile = signal(false);
  profileSaved = signal(false);
  profileError = signal<string | null>(null);
  private saveTimeoutTimer?: ReturnType<typeof setTimeout>;

  // Password state
  isSendingPasswordReset = signal(false);
  passwordSent = signal(false);
  passwordError = signal<string | null>(null);

  // Delete Account Modal state
  showDeleteModal = signal(false);
  deleteConfirmText = '';
  isDeletingAccount = signal(false);
  deleteError = signal<string | null>(null);

  private userSub?: Subscription;

  ngOnInit(): void {
    // Populate form from authenticated user
    this.userSub = this.authService.user$.subscribe((user) => {
      if (user) {
        this.populateUser(user);
      }
    });

    const current = this.authService.currentUser;
    if (current) {
      this.populateUser(current);
    }
  }

  ngOnDestroy(): void {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
    if (this.saveTimeoutTimer) {
      clearTimeout(this.saveTimeoutTimer);
    }
  }

  private populateUser(user: VamoUser): void {
    // Only overwrite if form has not been edited or initial load
    if (!this.isProfileDirty()) {
      this.firstName = user.first_name || '';
      this.lastName = user.last_name || '';
      this.email = user.email || '';
      this.originalFirstName = this.firstName;
      this.originalLastName = this.lastName;
      this.originalEmail = this.email;
    }
  }

  // ── Profile Validation & Dirty Checking ─────────────────────────────

  isFirstNameValid(): boolean {
    return !!this.firstName.trim();
  }

  isLastNameValid(): boolean {
    return !!this.lastName.trim();
  }

  isEmailValid(): boolean {
    const trimmed = this.email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }

  isProfileValid(): boolean {
    return this.isFirstNameValid() && this.isLastNameValid() && this.isEmailValid();
  }

  isProfileDirty(): boolean {
    return (
      this.firstName.trim() !== this.originalFirstName.trim() ||
      this.lastName.trim() !== this.originalLastName.trim() ||
      this.email.trim().toLowerCase() !== this.originalEmail.trim().toLowerCase()
    );
  }

  canSaveProfile(): boolean {
    return this.isProfileValid() && this.isProfileDirty();
  }

  onProfileInput(): void {
    this.profileSaved.set(false);
    this.profileError.set(null);
  }

  async saveProfile(): Promise<void> {
    this.firstNameTouched.set(true);
    this.lastNameTouched.set(true);
    this.emailTouched.set(true);

    if (!this.canSaveProfile() || this.isSavingProfile()) {
      return;
    }

    this.isSavingProfile.set(true);
    this.profileSaved.set(false);
    this.profileError.set(null);

    const payload = {
      first_name: this.firstName.trim(),
      last_name: this.lastName.trim(),
      email: this.email.trim().toLowerCase(),
    };

    try {
      const updatedUser = await this.authService.updateProfile(payload);
      this.originalFirstName = updatedUser.first_name || payload.first_name;
      this.originalLastName = updatedUser.last_name || payload.last_name;
      this.originalEmail = updatedUser.email || payload.email;

      this.firstName = this.originalFirstName;
      this.lastName = this.originalLastName;
      this.email = this.originalEmail;

      this.firstNameTouched.set(false);
      this.lastNameTouched.set(false);
      this.emailTouched.set(false);

      this.profileSaved.set(true);
      if (this.saveTimeoutTimer) clearTimeout(this.saveTimeoutTimer);
      this.saveTimeoutTimer = setTimeout(() => {
        this.profileSaved.set(false);
      }, 5000);
    } catch (err: any) {
      const code = err?.errors?.[0]?.extensions?.code || err?.code;
      if (code === 'RECORD_NOT_UNIQUE') {
        this.profileError.set(this.i18n.t('PORTAL.ERRORS.AUTH_MSG') || 'Email is already in use.');
      } else {
        this.profileError.set(this.i18n.t('PORTAL.SETTINGS.PROFILE_ERROR'));
      }
    } finally {
      this.isSavingProfile.set(false);
    }
  }

  // ── Password Reset CTA ──────────────────────────────────────────────

  async sendPasswordReset(): Promise<void> {
    const user = this.authService.currentUser;
    const targetEmail = user?.email || this.originalEmail;

    if (!targetEmail) {
      this.passwordError.set(this.i18n.t('PORTAL.SETTINGS.PASSWORD_ERROR'));
      return;
    }

    this.isSendingPasswordReset.set(true);
    this.passwordSent.set(false);
    this.passwordError.set(null);

    try {
      await this.authService.requestPasswordReset(targetEmail);
      this.passwordSent.set(true);
    } catch {
      this.passwordError.set(this.i18n.t('PORTAL.SETTINGS.PASSWORD_ERROR'));
    } finally {
      this.isSendingPasswordReset.set(false);
    }
  }

  // ── Delete Account Confirmation Modal ───────────────────────────────

  openDeleteModal(): void {
    this.deleteConfirmText = '';
    this.deleteError.set(null);
    this.showDeleteModal.set(true);

    // Autofocus input on next tick
    setTimeout(() => {
      this.deleteInputRef?.nativeElement?.focus();
    }, 50);
  }

  closeDeleteModal(): void {
    if (this.isDeletingAccount()) return;
    this.showDeleteModal.set(false);
    this.deleteConfirmText = '';
    this.deleteError.set(null);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isDeletingAccount()) {
      this.closeDeleteModal();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event?: Event): void {
    if (this.showDeleteModal() && !this.isDeletingAccount()) {
      if (event) event.preventDefault();
      this.closeDeleteModal();
    }
  }

  isDeleteConfirmed(): boolean {
    return this.deleteConfirmText.trim() === 'DELETE';
  }

  onDeleteEnter(event?: Event): void {
    if (event) event.preventDefault();
    if (this.isDeleteConfirmed() && !this.isDeletingAccount()) {
      this.confirmDelete();
    }
  }

  async confirmDelete(): Promise<void> {
    if (!this.isDeleteConfirmed() || this.isDeletingAccount()) {
      return;
    }

    this.isDeletingAccount.set(true);
    this.deleteError.set(null);

    try {
      await this.authService.deleteAccount();
      // On successful deletion, session is cleared; route immediately to /login
      this.showDeleteModal.set(false);
      await this.router.navigate(['/login'], { replaceUrl: true });
    } catch (err: any) {
      this.isDeletingAccount.set(false);
      if (err?.message === 'DELETE_ACCOUNT_FLOW_NOT_CONFIGURED') {
        this.deleteError.set(this.i18n.t('PORTAL.SETTINGS.DELETE_UNAVAILABLE'));
      } else if (
        err?.message === 'SESSION_EXPIRED' ||
        err?.message === 'NOT_AUTHENTICATED' ||
        err?.status === 401 ||
        err?.status === 403
      ) {
        this.deleteError.set(this.i18n.t('PORTAL.SETTINGS.DELETE_SESSION_EXPIRED'));
      } else if (
        err?.isNetworkError ||
        err?.name === 'TypeError' ||
        err?.message === 'NETWORK_ERROR' ||
        err?.message?.includes('network') ||
        err?.message?.includes('Failed to fetch') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        this.deleteError.set(this.i18n.t('PORTAL.SETTINGS.DELETE_NETWORK_ERROR'));
      } else {
        this.deleteError.set(this.i18n.t('PORTAL.SETTINGS.DELETE_ERROR'));
      }
    }
  }
}
