import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { VamoUser } from '../../core/models/user.model';

describe('SettingsComponent (Account Settings V1)', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let authServiceSpy: any;
  let routerSpy: any;
  let i18nService: I18nService;
  let userSubject: BehaviorSubject<VamoUser | null>;

  const initialUser: VamoUser = {
    id: 'user-456',
    first_name: 'Kristen',
    last_name: 'Weis',
    email: 'kristen@example.com',
    role: { id: 'role-customer', name: 'customer' },
    provider_link: {
      id: 'prov-789',
      name: 'Cabarete Kite School',
      subscription_tier: 'basic',
    },
  };

  beforeEach(async () => {
    userSubject = new BehaviorSubject<VamoUser | null>(initialUser);

    authServiceSpy = {
      user$: userSubject.asObservable(),
      get currentUser() {
        return userSubject.value;
      },
      updateProfile: vi.fn().mockImplementation(async (data: any) => {
        const updated = { ...userSubject.value, ...data };
        userSubject.next(updated);
        return updated;
      }),
      requestPasswordReset: vi.fn().mockResolvedValue(undefined),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
    };

    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        I18nService,
      ],
    }).compileComponents();

    i18nService = TestBed.inject(I18nService);
    i18nService.setLang('en');

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Initial State & Scope Isolation
  // =========================================================================
  describe('Initial State & Scope Isolation', () => {
    it('creates component successfully', () => {
      expect(component).toBeTruthy();
    });

    it('loads current user first_name, last_name, and email into form', () => {
      expect(component.firstName).toBe('Kristen');
      expect(component.lastName).toBe('Weis');
      expect(component.email).toBe('kristen@example.com');
    });

    it('strictly isolates scope to personal user fields (no business/provider fields in template)', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      // Must not display business name, subscription tier, or provider fields in the form
      expect(compiled.querySelector('input[name="businessName"]')).toBeNull();
      expect(compiled.querySelector('input[name="provider"]')).toBeNull();
      expect(compiled.querySelector('input[name="subscriptionTier"]')).toBeNull();
      expect(compiled.textContent).not.toContain('Cabarete Kite School');
    });

    it('disables Save button on initial load when values are unchanged', () => {
      const saveBtn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
      expect(component.canSaveProfile()).toBe(false);
    });
  });

  // =========================================================================
  // 2. Profile Validation & Submission
  // =========================================================================
  describe('Profile Form Validation & Save', () => {
    it('enables Save button when valid edits are introduced', () => {
      component.firstName = 'Kris';
      component.onProfileInput();
      fixture.detectChanges();

      expect(component.isProfileDirty()).toBe(true);
      expect(component.isProfileValid()).toBe(true);
      expect(component.canSaveProfile()).toBe(true);

      const saveBtn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('disables Save button when first name is empty', () => {
      component.firstName = '   ';
      component.onProfileInput();
      fixture.detectChanges();

      expect(component.isFirstNameValid()).toBe(false);
      expect(component.canSaveProfile()).toBe(false);
    });

    it('disables Save button when last name is empty', () => {
      component.lastName = '   ';
      component.onProfileInput();
      fixture.detectChanges();

      expect(component.isLastNameValid()).toBe(false);
      expect(component.canSaveProfile()).toBe(false);
    });

    it('disables Save button when email is invalid format', () => {
      component.email = 'not-an-email';
      component.onProfileInput();
      fixture.detectChanges();

      expect(component.isEmailValid()).toBe(false);
      expect(component.canSaveProfile()).toBe(false);
    });

    it('calls AuthService.updateProfile with trimmed and lowercased payload on submit', async () => {
      component.firstName = '  Kristen Marie  ';
      component.lastName = '  Weis  ';
      component.email = '  KRISTEN.WEIS@EXAMPLE.COM  ';
      fixture.detectChanges();

      await component.saveProfile();

      expect(authServiceSpy.updateProfile).toHaveBeenCalledWith({
        first_name: 'Kristen Marie',
        last_name: 'Weis',
        email: 'kristen.weis@example.com',
      });
    });

    it('shows saved banner and disables Save button after successful update', async () => {
      component.firstName = 'Kristy';
      fixture.detectChanges();

      await component.saveProfile();
      fixture.detectChanges();

      expect(component.profileSaved()).toBe(true);
      const successBanner = fixture.nativeElement.querySelector('.banner-success');
      expect(successBanner).toBeTruthy();
      expect(successBanner.textContent).toContain('Changes saved.');

      // Save button should now be disabled because form matches newly saved state
      expect(component.canSaveProfile()).toBe(false);
    });

    it('shows customer-safe error banner when profile update fails', async () => {
      authServiceSpy.updateProfile.mockRejectedValueOnce(new Error('Update failed'));

      component.firstName = 'NewName';
      fixture.detectChanges();

      await component.saveProfile();
      fixture.detectChanges();

      expect(component.profileSaved()).toBe(false);
      expect(component.profileError()).toBe('Could not update profile. Please try again.');

      const errorBanner = fixture.nativeElement.querySelector('.banner-error');
      expect(errorBanner).toBeTruthy();
      expect(errorBanner.textContent).toContain('Could not update profile. Please try again.');
    });
  });

  // =========================================================================
  // 3. Password Reset CTA
  // =========================================================================
  describe('Password Reset CTA', () => {
    it('dispatches password reset request with current authenticated email', async () => {
      await component.sendPasswordReset();

      expect(authServiceSpy.requestPasswordReset).toHaveBeenCalledWith('kristen@example.com');
      expect(component.passwordSent()).toBe(true);
      expect(component.passwordError()).toBeNull();

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Check your email for a password reset link.');
    });

    it('shows safe customer error when password reset request fails', async () => {
      authServiceSpy.requestPasswordReset.mockRejectedValueOnce(new Error('SMTP failure'));

      await component.sendPasswordReset();

      expect(component.passwordSent()).toBe(false);
      expect(component.passwordError()).toBe('Could not send password reset email. Please try again.');

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Could not send password reset email. Please try again.');
    });

    it('never logs or exposes password values', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await component.sendPasswordReset();

      for (const call of consoleSpy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toMatch(/password/i);
        }
      }
    });
  });

  // =========================================================================
  // 4. Delete Account Danger Zone & Confirmation Modal
  // =========================================================================
  describe('Delete Account Modal & Action', () => {
    it('does not display delete modal initially', () => {
      expect(component.showDeleteModal()).toBe(false);
      const modal = fixture.nativeElement.querySelector('.modal-backdrop');
      expect(modal).toBeNull();
    });

    it('opens modal on clicking Delete Account button', () => {
      const deleteBtn = fixture.nativeElement.querySelector('.btn-danger-outline') as HTMLButtonElement;
      deleteBtn.click();
      fixture.detectChanges();

      expect(component.showDeleteModal()).toBe(true);
      const modal = fixture.nativeElement.querySelector('.modal-backdrop');
      expect(modal).toBeTruthy();
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    it('disables DELETE PERMANENTLY until exact text DELETE is entered', () => {
      component.openDeleteModal();
      fixture.detectChanges();

      // Empty input
      expect(component.isDeleteConfirmed()).toBe(false);

      // Partial / lower-case inputs
      component.deleteConfirmText = 'delete';
      expect(component.isDeleteConfirmed()).toBe(false);

      component.deleteConfirmText = 'DEL';
      expect(component.isDeleteConfirmed()).toBe(false);

      component.deleteConfirmText = 'DELETE ';
      expect(component.isDeleteConfirmed()).toBe(true);

      component.deleteConfirmText = 'DELETE';
      expect(component.isDeleteConfirmed()).toBe(true);
    });

    it('closes modal and clears confirmation text on Cancel (Keep my account)', () => {
      component.openDeleteModal();
      component.deleteConfirmText = 'DEL';
      fixture.detectChanges();

      component.closeDeleteModal();
      fixture.detectChanges();

      expect(component.showDeleteModal()).toBe(false);
      expect(component.deleteConfirmText).toBe('');
      expect(fixture.nativeElement.querySelector('.modal-backdrop')).toBeNull();
    });

    it('closes modal on Escape key press when not deleting', () => {
      component.openDeleteModal();
      fixture.detectChanges();

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      component.onEscapeKey(escapeEvent);
      fixture.detectChanges();

      expect(component.showDeleteModal()).toBe(false);
    });

    it('executes canonical deleteAccount, clears session and redirects to /login on confirmed deletion', async () => {
      component.openDeleteModal();
      component.deleteConfirmText = 'DELETE';
      fixture.detectChanges();

      await component.confirmDelete();

      expect(authServiceSpy.deleteAccount).toHaveBeenCalledTimes(1);
      expect(component.showDeleteModal()).toBe(false);
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    });

    it('preserves modal and session with friendly error notice if deletion fails', async () => {
      authServiceSpy.deleteAccount.mockRejectedValueOnce(new Error('Network error'));

      component.openDeleteModal();
      component.deleteConfirmText = 'DELETE';
      fixture.detectChanges();

      await component.confirmDelete();
      fixture.detectChanges();

      expect(component.isDeletingAccount()).toBe(false);
      expect(component.showDeleteModal()).toBe(true);
      expect(component.deleteError()).toBe('Could not delete account. Please try again or contact support.');
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('prevents multiple delete submissions while processing', async () => {
      component.openDeleteModal();
      component.deleteConfirmText = 'DELETE';
      component.isDeletingAccount.set(true);

      await component.confirmDelete();

      expect(authServiceSpy.deleteAccount).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. I18N Parity & Reactive Switching
  // =========================================================================
  describe('I18N Parity & Language Switching', () => {
    it('reactively switches between English and Spanish', () => {
      // English
      i18nService.setLang('en');
      fixture.detectChanges();
      let compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-title')?.textContent).toContain('Account Settings');
      expect(compiled.querySelector('#profile-heading')?.textContent).toContain('Your Profile');

      // Spanish
      i18nService.setLang('es');
      fixture.detectChanges();
      compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-title')?.textContent).toContain('Configuración de la cuenta');
      expect(compiled.querySelector('#profile-heading')?.textContent).toContain('Tu perfil');
    });
  });
});
