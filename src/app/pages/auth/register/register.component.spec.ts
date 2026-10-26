import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';
import { GoogleAuthService } from '../../../core/services/google-auth.service';
import { CustomerErrorService } from '../../../core/services/customer-error.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';

describe('RegisterComponent (Canonical Source Parity)', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authServiceSpy: any;
  let routerSpy: any;

  beforeEach(async () => {
    authServiceSpy = {
      register: vi.fn(),
      login: vi.fn(),
      loginWithProvider: vi.fn(),
      loginWithGoogle: vi.fn().mockResolvedValue({ id: 'google-user', first_name: 'Mateo', last_name: 'Peralta', email: 'mateo@google.com', provider_link: null }),
      loginWithGoogleCredential: vi.fn().mockResolvedValue({ id: 'google-user', first_name: 'Mateo', last_name: 'Peralta', email: 'mateo@google.com', provider_link: null }),
    };

    routerSpy = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, FormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: GoogleAuthService, useValue: { loadGoogleScript: vi.fn().mockRejectedValue(new Error('GOOGLE_SDK_UNAVAILABLE')), renderButton: vi.fn() } },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
        CustomerErrorService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('1. should create the register component', () => {
    expect(component).toBeTruthy();
  });

  it('2. should initialize with empty fields, agreedToTerms true by default, and disabled submit button', () => {
    expect(component.firstName).toBe('');
    expect(component.lastName).toBe('');
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
    expect(component.agreedToTerms).toBe(true);

    const submitBtn = fixture.nativeElement.querySelector('.submit-btn') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('3. should validate email format', () => {
    component.email = 'not-an-email';
    expect(component.isEmailValid()).toBe(false);

    component.email = 'valid.operator@domain.do';
    expect(component.isEmailValid()).toBe(true);
  });

  it('4. should require minimum password length of 6 and matching confirmation', () => {
    component.firstName = 'Maria';
    component.lastName = 'Gomez';
    component.email = 'maria@test.com';
    component.password = '12345';
    component.confirmPassword = '12345';
    expect(component.isFormValid()).toBe(false);

    component.password = '123456';
    component.confirmPassword = 'different';
    expect(component.isFormValid()).toBe(false);

    component.confirmPassword = '123456';
    expect(component.isFormValid()).toBe(true);
  });

  it('5. should require agreedToTerms = true', () => {
    component.firstName = 'Maria';
    component.lastName = 'Gomez';
    component.email = 'maria@test.com';
    component.password = '123456';
    component.confirmPassword = '123456';
    component.agreedToTerms = false;
    expect(component.isFormValid()).toBe(false);

    component.agreedToTerms = true;
    expect(component.isFormValid()).toBe(true);
  });

  it('6. should submit valid registration, log in, and route to /app/overview when user has linked business', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@resort.com',
      provider_link: { id: 'prov-1', name: 'Cabarete Surf Resort' },
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'owner@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
    component.agreedToTerms = true;

    await component.onSubmit();

    expect(authServiceSpy.register).toHaveBeenCalledWith({
      first_name: 'Carlos',
      last_name: 'Mendoza',
      email: 'owner@resort.com',
      password: 'secret123',
    });
    expect(authServiceSpy.login).toHaveBeenCalledWith('owner@resort.com', 'secret123');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
    expect(component.loading).toBe(false);
  });

  it('7. should submit valid registration, log in, and route to /no-business when user has no linked business', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockResolvedValue({
      id: 'usr-2',
      email: 'user@gmail.com',
      provider_link: null,
    });

    component.firstName = 'Ana';
    component.lastName = 'Reyes';
    component.email = 'user@gmail.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
    component.agreedToTerms = true;

    await component.onSubmit();

    expect(authServiceSpy.register).toHaveBeenCalled();
    expect(authServiceSpy.login).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  it('8. should show duplicate email warning and login link when email is already taken', async () => {
    authServiceSpy.register.mockRejectedValue({
      errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Email already taken' }],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'existing@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.emailTaken).toBe(true);
    const warning = fixture.nativeElement.querySelector('.alert-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('This email address is already registered');
    expect(component.loading).toBe(false);
  });

  it('9. should display customer-safe error banner without technical Directus leaks on unexpected failure', async () => {
    authServiceSpy.register.mockRejectedValue(new Error('Directus database connection refused'));

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@test.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBeTruthy();
    expect(component.errorMessage.toLowerCase()).not.toContain('directus');
    expect(component.errorMessage.toLowerCase()).not.toContain('database');
    expect(component.loading).toBe(false);
  });

  it('10. Google fallback uses the canonical flow and routes an unlinked user to no-business', async () => {
    await component.onGoogleSignUp();
    expect(authServiceSpy.loginWithGoogle).toHaveBeenCalledOnce();
    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
    expect(component.loading).toBe(false);
  });

  it('Google popup credential uses the canonical exchange and routes an existing business to overview', async () => {
    authServiceSpy.loginWithGoogleCredential.mockResolvedValue({ id: 'owner', provider_link: { id: 'provider' } });
    await component.onGoogleCredentialSuccess('mock-google-credential');
    expect(authServiceSpy.loginWithGoogleCredential).toHaveBeenCalledWith('mock-google-credential');
    expect(authServiceSpy.loginWithProvider).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
  });

  it('Google cancellation restores the button and keeps the customer on registration', async () => {
    authServiceSpy.loginWithGoogle.mockRejectedValue(new Error('GOOGLE_POPUP_CLOSED'));
    await component.onGoogleSignUp();
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBeTruthy();
    expect(component.errorMessage).not.toContain('GOOGLE_POPUP_CLOSED');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('11. should not render Apple action button while preserving component Apple sign-up method and Google action', () => {
    expect(fixture.nativeElement.querySelector('.apple-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.google-btn')).toBeTruthy();

    component.onAppleSignUp();
    expect(authServiceSpy.loginWithProvider).toHaveBeenCalledWith('apple', '/app/overview');
  });

  it('12. should toggle password and confirmPassword visibility flags', () => {
    expect(component.showPassword).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(false);

    expect(component.showConfirmPassword).toBe(false);
    component.toggleConfirmPasswordVisibility();
    expect(component.showConfirmPassword).toBe(true);
    component.toggleConfirmPasswordVisibility();
    expect(component.showConfirmPassword).toBe(false);
  });

  it('13. should display duplicate email warning with Sign in and Reset password links in EN and ES when existing email with matching password triggers RECORD_NOT_UNIQUE', async () => {
    authServiceSpy.register.mockRejectedValue({
      errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Email is already registered' }],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'existing@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.emailTaken).toBe(true);
    expect(component.errorMessage).toBe('');
    const warning = fixture.nativeElement.querySelector('.alert-warning') as HTMLElement;
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('This email address is already registered.');
    expect(warning.textContent).toContain('Already have a VAMO account?');
    expect(warning.textContent).toContain('Sign in');
    expect(warning.textContent).toContain('reset your password');
    expect(warning.textContent).not.toContain('session has expired');

    const links = Array.from(warning.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.length).toBe(2);

    // Switch to Spanish
    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();
    expect(warning.textContent).toContain('Esta dirección de correo electrónico ya está registrada.');
    expect(warning.textContent).toContain('¿Ya tienes una cuenta de VAMO?');
    expect(warning.textContent).toContain('Inicia sesión');
    expect(warning.textContent).toContain('restablece tu contraseña');

    i18n.setLang('en');
  });

  it('14. should NOT display session expired message when existing email is submitted with an incorrect password (post-register login 401)', async () => {
    // Directus registerUser returns 204 for existing email, then login() fails with 401 INVALID_CREDENTIALS
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockRejectedValue({
      status: 401,
      errors: [{ extensions: { code: 'INVALID_CREDENTIALS' }, message: 'Invalid user credentials.' }],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'existing@resort.com';
    component.password = 'differentPass123';
    component.confirmPassword = 'differentPass123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.emailTaken).toBe(false);
    expect(component.showAuthRecoveryLinks).toBe(true);
    expect(component.errorMessage).toBe(
      "We couldn't complete registration with this email. If you already have a VAMO account, sign in or reset your password."
    );
    expect(component.errorMessage).not.toContain('session has expired');

    const errorBanner = fixture.nativeElement.querySelector('.alert-error') as HTMLElement;
    expect(errorBanner).toBeTruthy();
    expect(errorBanner.textContent).toContain('Sign in');
    expect(errorBanner.textContent).toContain('reset your password');

    // Switch to Spanish reactively
    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();
    expect(component.errorMessage).toBe(
      'No pudimos completar el registro con este correo electrónico. Si ya tienes una cuenta de VAMO, inicia sesión o restablece tu contraseña.'
    );
    i18n.setLang('en');
  });

  it('15. should display network error message when registration fails due to network issue', async () => {
    authServiceSpy.register.mockRejectedValue(new Error('Failed to fetch'));

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBe("We're having trouble connecting. Check your connection and try again.");
    expect(component.errorMessage).not.toContain('session has expired');
  });

  it('16. should display safe configuration error message in EN and ES when Directus rejects verification_url with INVALID_PAYLOAD', async () => {
    authServiceSpy.register.mockRejectedValue({
      status: 400,
      errors: [
        {
          message: 'Invalid payload. URL "https://vamo-app.com/verify.html" can\'t be used to verify registered users.',
          extensions: {
            reason: 'URL "https://vamo-app.com/verify.html" can\'t be used to verify registered users',
            code: 'INVALID_PAYLOAD',
          },
        },
      ],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBe(
      'Account registration is temporarily unavailable due to a configuration issue. Please try again later.'
    );
    expect(component.errorMessage).not.toContain('verify.html');
    expect(component.showAuthRecoveryLinks).toBe(false);

    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();
    expect(component.errorMessage).toBe(
      'El registro de cuentas no está disponible temporalmente debido a un problema de configuración. Por favor inténtalo más tarde.'
    );
    i18n.setLang('en');
  });

  it('17. should display post-registration sign-in recovery message in EN and ES when registration succeeds while login fails', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockRejectedValue(new Error('Login timed out'));

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBe(
      "Your account was created, but we couldn't sign you in automatically. Please sign in to continue."
    );
    expect(component.showAuthRecoveryLinks).toBe(true);

    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();
    expect(component.errorMessage).toBe(
      'Tu cuenta fue creada, pero no pudimos iniciar sesión automáticamente. Por favor inicia sesión para continuar.'
    );
    i18n.setLang('en');
  });

  it('18. should display email verification required message in EN and ES when account requires verification before login', async () => {
    authServiceSpy.register.mockResolvedValue(undefined);
    authServiceSpy.login.mockRejectedValue({
      errors: [{ extensions: { code: 'UNVERIFIED_USER' }, message: 'Please verify your email before logging in.' }],
    });

    component.firstName = 'Carlos';
    component.lastName = 'Mendoza';
    component.email = 'carlos@resort.com';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';

    await component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toBe(
      'Your account has been created. Please check your inbox and verify your email address before signing in.'
    );
    expect(component.showAuthRecoveryLinks).toBe(true);

    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();
    expect(component.errorMessage).toBe(
      'Tu cuenta ha sido creada. Por favor revisa tu bandeja de entrada y verifica tu correo electrónico antes de iniciar sesión.'
    );
    i18n.setLang('en');
  });
});

