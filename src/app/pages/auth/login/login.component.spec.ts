import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../../core/i18n/i18n.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: any;
  let routerSpy: any;

  beforeEach(async () => {
    authServiceSpy = {
      login: vi.fn(),
      requestPasswordReset: vi.fn(),
      loginWithGoogle: vi.fn().mockReturnValue(new Promise(() => {})),
      loginWithProvider: vi.fn(),
    };

    routerSpy = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, FormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the login component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty credentials and disabled submit', () => {
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    const button = fixture.nativeElement.querySelector('.submit-btn') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('should display error message on invalid credentials', async () => {
    authServiceSpy.login.mockRejectedValue({
      errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
    });

    component.email = 'wrong@vamo.com';
    component.password = 'badpassword';
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toContain('Invalid email or password');
    const alert = fixture.nativeElement.querySelector('.alert-error');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Invalid email or password');
  });

  it('should navigate to /app/overview on successful login with provider_link', async () => {
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@beachbar.com',
      provider_link: { id: 'prov-1', name: 'Las Terrenas Beach Bar' },
    });

    component.email = 'owner@beachbar.com';
    component.password = 'validpass123';
    await component.onSubmit();

    expect(authServiceSpy.login).toHaveBeenCalledWith('owner@beachbar.com', 'validpass123');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
  });

  it('should navigate to /no-business on successful login without provider_link', async () => {
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-2',
      email: 'consumer@gmail.com',
      provider_link: null,
    });

    component.email = 'consumer@gmail.com';
    component.password = 'validpass123';
    await component.onSubmit();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  it('should open forgot password modal and dispatch reset email', async () => {
    authServiceSpy.requestPasswordReset.mockResolvedValue(undefined);

    component.openForgotModal();
    expect(component.showForgotModal).toBe(true);

    component.forgotEmail = 'recovery@business.com';
    await component.sendPasswordReset();

    expect(authServiceSpy.requestPasswordReset).toHaveBeenCalledWith('recovery@business.com');
    expect(component.showForgotModal).toBe(false);
    expect(component.successMessage).toContain('recovery@business.com');
  });

  it('should toggle password visibility and update input type and aria-label', () => {
    const passwordInput = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    const toggleBtn = fixture.nativeElement.querySelector('.password-toggle-btn') as HTMLButtonElement;

    expect(component.showPassword).toBe(false);
    expect(passwordInput.type).toBe('password');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Show password');

    toggleBtn.click();
    fixture.detectChanges();

    expect(component.showPassword).toBe(true);
    expect(passwordInput.type).toBe('text');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Hide password');

    toggleBtn.click();
    fixture.detectChanges();

    expect(component.showPassword).toBe(false);
    expect(passwordInput.type).toBe('password');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Show password');
  });

  it('should trigger Google SSO via AuthService', () => {
    authServiceSpy.loginWithGoogle = vi.fn().mockReturnValue(new Promise(() => {}));
    const googleBtn = fixture.nativeElement.querySelector('.google-btn') as HTMLButtonElement;

    googleBtn.click();

    expect(authServiceSpy.loginWithGoogle).toHaveBeenCalled();
    expect(component.loading).toBe(true);
  });

  it('should not render Apple action button while preserving component Apple SSO method and Google action', () => {
    authServiceSpy.loginWithProvider = vi.fn();
    const appleBtn = fixture.nativeElement.querySelector('.apple-btn');
    const googleBtn = fixture.nativeElement.querySelector('.google-btn');

    expect(appleBtn).toBeNull();
    expect(googleBtn).toBeTruthy();

    component.onAppleLogin();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('apple', '/app/overview');
    expect(component.loading).toBe(true);
  });

  it('should display neutral VAMO Business preview card copy without cross-platform claims', () => {
    const previewCard = fixture.nativeElement.querySelector('.hero-preview-card');
    expect(previewCard).toBeTruthy();
    expect(previewCard.textContent).toContain('Your VAMO Business');
    expect(previewCard.textContent).toContain('Manage your profile, events, and promotions in one place.');
    expect(previewCard.textContent).not.toContain('Dominican Discovery Network');
    expect(previewCard.textContent).not.toContain('Instant sync across iOS, Android, and Web');
  });

  it('should translate unexpected backend errors into customer-safe message without leaking Directus internals', async () => {
    authServiceSpy.login.mockRejectedValue(new Error('Directus 403 Forbidden: access denied on collection providers'));

    component.email = 'owner@beachbar.com';
    component.password = 'validpass123';
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).not.toContain('Directus');
    expect(component.errorMessage).not.toContain('403');
    expect(component.errorMessage).not.toContain('collection');
    expect(component.errorMessage).not.toContain('providers');
    expect(component.errorMessage).toBe("We couldn't make that change. This action is not available for your account.");
  });

  it('should reset loading state and show message when login fails with non-credential error', async () => {
    authServiceSpy.login.mockRejectedValue(new Error('Network failure'));

    component.email = 'test@example.com';
    component.password = 'password123';
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBeTruthy();
  });

  describe('Login Failure & Resilience Regressions', () => {
    it('should reset loading state, re-enable controls, and restore button text on bad password', async () => {
      authServiceSpy.login.mockRejectedValue({
        errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
      });

      component.email = 'operator@business.com';
      component.password = 'wrongsecret';
      fixture.detectChanges();

      const emailInput = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
      const passwordInput = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
      const submitBtn = fixture.nativeElement.querySelector('.submit-btn') as HTMLButtonElement;

      expect(submitBtn.disabled).toBe(false);

      const submitPromise = component.onSubmit();
      expect(component.loading).toBe(true);

      await submitPromise;
      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(emailInput.disabled).toBe(false);
      expect(passwordInput.disabled).toBe(false);
      expect(submitBtn.disabled).toBe(false);
      expect(submitBtn.textContent).toContain('Login');
      expect(fixture.nativeElement.querySelector('.spinner')).toBeNull();
      expect(component.errorMessage).toBe('Invalid email or password. Please check your credentials and try again.');
    });

    it('should display the exact English error message without raw Directus details on bad credentials', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      authServiceSpy.login.mockRejectedValue({
        errors: [{ message: 'Invalid user credentials.', extensions: { code: 'INVALID_CREDENTIALS' } }],
      });

      component.email = 'operator@business.com';
      component.password = 'badpassword';
      await component.onSubmit();
      fixture.detectChanges();

      expect(component.errorMessage).toBe('Invalid email or password. Please check your credentials and try again.');
      expect(component.errorMessage).not.toContain('Directus');
      expect(component.errorMessage).not.toContain('extensions');
      const alert = fixture.nativeElement.querySelector('.alert-error');
      expect(alert.textContent).toContain('Invalid email or password. Please check your credentials and try again.');
    });

    it('should display the Spanish equivalent error message when language is set to ES', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      authServiceSpy.login.mockRejectedValue({
        status: 401,
        message: 'Invalid user credentials.',
      });

      component.email = 'operator@business.com';
      component.password = 'badpassword';
      await component.onSubmit();
      fixture.detectChanges();

      expect(component.errorMessage).toContain('Correo o contraseña no válidos');
      expect(component.errorMessage).not.toContain('Directus');
      expect(component.errorMessage).not.toContain('401');
      const alert = fixture.nativeElement.querySelector('.alert-error');
      expect(alert.textContent).toContain('Correo o contraseña no válidos');

      i18n.setLang('en');
    });

    it('should normalize varied Directus auth errors including HTTP 401 and INVALID_USER_CREDENTIALS', async () => {
      // Directus variation 1: INVALID_USER_CREDENTIALS code
      authServiceSpy.login.mockRejectedValue({
        errors: [{ extensions: { code: 'INVALID_USER_CREDENTIALS' } }],
      });
      component.email = 'operator@business.com';
      component.password = 'badpassword';
      await component.onSubmit();
      expect(component.errorMessage).toBe('Invalid email or password. Please check your credentials and try again.');

      // Directus variation 2: HTTP 401 status
      authServiceSpy.login.mockRejectedValue({
        status: 401,
        response: { status: 401 },
      });
      await component.onSubmit();
      expect(component.errorMessage).toBe('Invalid email or password. Please check your credentials and try again.');

      // Directus variation 3: message without extensions
      authServiceSpy.login.mockRejectedValue({
        message: 'Invalid user credentials.',
      });
      await component.onSubmit();
      expect(component.errorMessage).toBe('Invalid email or password. Please check your credentials and try again.');
    });

    it('should handle hung login timeout, resetting loading state and showing customer-safe connection error in EN', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');

      const timeoutErr = new Error('Authentication request timed out. Please check your connection and try again.');
      (timeoutErr as any).code = 'LOGIN_TIMEOUT';
      authServiceSpy.login.mockRejectedValue(timeoutErr);

      component.email = 'operator@business.com';
      component.password = 'secret';
      fixture.detectChanges();

      const emailInput = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
      const passwordInput = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
      const submitBtn = fixture.nativeElement.querySelector('.submit-btn') as HTMLButtonElement;

      const submitPromise = component.onSubmit();
      expect(component.loading).toBe(true);

      await submitPromise;
      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(emailInput.disabled).toBe(false);
      expect(passwordInput.disabled).toBe(false);
      expect(submitBtn.disabled).toBe(false);
      expect(submitBtn.textContent).toContain('Login');
      expect(fixture.nativeElement.querySelector('.spinner')).toBeNull();
      expect(component.errorMessage).toBe('The sign-in request timed out. Please check your connection and try again.');
      expect(component.errorMessage).not.toContain('LOGIN_TIMEOUT');
    });

    it('should handle hung login timeout in Spanish when language is set to ES', async () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('es');

      const timeoutErr = new Error('Authentication request timed out.');
      (timeoutErr as any).code = 'LOGIN_TIMEOUT';
      authServiceSpy.login.mockRejectedValue(timeoutErr);

      component.email = 'operator@business.com';
      component.password = 'secret';
      await component.onSubmit();
      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.errorMessage).toContain('La solicitud de inicio de sesión ha caducado');
      i18n.setLang('en');
    });

    it('should ensure Google login remains completely unaffected by password login error changes', async () => {
      authServiceSpy.loginWithGoogleCredential = vi.fn().mockResolvedValue({
        id: 'usr-google',
        email: 'google@vamo.com',
        provider_link: { id: 'prov-1', name: 'Google Cafe' },
      });

      await component.onGoogleCredentialSuccess('mock-google-credential');
      expect(authServiceSpy.loginWithGoogleCredential).toHaveBeenCalledWith('mock-google-credential');
      expect(routerSpy.navigateByUrl).toHaveBeenCalled();
      expect(component.loading).toBe(false);
    });

    it('should ensure Forgot Password flow remains completely unaffected and resets loading', async () => {
      authServiceSpy.requestPasswordReset.mockRejectedValue(new Error('Reset service busy'));

      component.openForgotModal();
      expect(component.showForgotModal).toBe(true);
      expect(component.forgotLoading).toBe(false);

      component.forgotEmail = 'operator@business.com';
      await component.sendPasswordReset();

      expect(component.forgotLoading).toBe(false);
      expect(component.forgotError).toBeTruthy();
      expect(component.showForgotModal).toBe(true);
    });
  });
});
