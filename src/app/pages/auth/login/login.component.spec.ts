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
      sanitizeReturnUrl: vi.fn().mockImplementation((url: string) => {
        if (!url || typeof url !== 'string' || !url.startsWith('/app') || url.startsWith('//')) {
          return '/app/overview';
        }
        return url;
      }),
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

  it('should automatically open forgot password modal and prefill email when accessed via /forgot-password route', () => {
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).routeConfig = { path: 'forgot-password' };
    (route.snapshot as any).queryParams = { email: 'existing@resort.do' };

    const forgotFixture = TestBed.createComponent(LoginComponent);
    const forgotComp = forgotFixture.componentInstance;
    forgotFixture.detectChanges();

    expect(forgotComp.showForgotModal).toBe(true);
    expect(forgotComp.email).toBe('existing@resort.do');
    expect(forgotComp.forgotEmail).toBe('existing@resort.do');
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

  it('should render Apple action button beneath Google and trigger loginWithApple', () => {
    authServiceSpy.loginWithApple = vi.fn().mockReturnValue(new Promise(() => {}));
    const appleBtn = fixture.nativeElement.querySelector('.apple-btn') as HTMLButtonElement;
    const googleBtn = fixture.nativeElement.querySelector('.google-btn');

    expect(appleBtn).toBeTruthy();
    expect(googleBtn).toBeTruthy();

    appleBtn.click();
    expect(authServiceSpy.loginWithApple).toHaveBeenCalled();
    expect(component.loading).toBe(true);
  });

  it('should display marketing panel with reference copy, how it works section, and four steps', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const heroTitle = compiled.querySelector('.business-hero h1');
    const heroSubtitle = compiled.querySelector('.business-hero-subtitle');
    const sectionTitle = compiled.querySelector('.process-section h2');
    const sectionSubtitle = compiled.querySelector('.section-subtitle');
    const stepCards = compiled.querySelectorAll('.process-card');

    expect(heroTitle?.textContent).toContain('Get discovered. Get customers.');
    expect(heroSubtitle?.textContent).toContain('Put your business, events, offers, and experiences in front of locals and travelers looking for things to do in the Dominican Republic.');
    expect(sectionTitle?.textContent).toContain('How It Works');
    expect(sectionSubtitle?.textContent).toContain('Start reaching customers in four simple steps.');

    expect(stepCards.length).toBe(4);
    expect(stepCards[0].textContent).toContain('STEP 1');
    expect(stepCards[0].textContent).toContain('Create your business profile');
    expect(stepCards[1].textContent).toContain('STEP 2');
    expect(stepCards[1].textContent).toContain('Publish your posts');
    expect(stepCards[2].textContent).toContain('STEP 3');
    expect(stepCards[2].textContent).toContain('Promote important posts');
    expect(stepCards[3].textContent).toContain('STEP 4');
    expect(stepCards[3].textContent).toContain('See how people engage');

    // Bullets and preview card removed
    expect(compiled.querySelector('.hero-preview-card')).toBeNull();
    expect(compiled.querySelector('.hero-features')).toBeNull();
  });

  it('should reactively switch marketing panel copy to Spanish', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLang('es');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const heroTitle = compiled.querySelector('.business-hero h1');
    const heroSubtitle = compiled.querySelector('.business-hero-subtitle');
    const sectionTitle = compiled.querySelector('.process-section h2');
    const stepCards = compiled.querySelectorAll('.process-card');

    expect(heroTitle?.textContent).toContain('Haz que te descubran. Consigue clientes.');
    expect(heroSubtitle?.textContent).toContain('Pon tu negocio, eventos, ofertas y experiencias frente a residentes y viajeros que buscan qué hacer en la República Dominicana.');
    expect(sectionTitle?.textContent).toContain('Cómo Funciona');
    expect(stepCards[0].textContent).toContain('PASO 1');
    expect(stepCards[0].textContent).toContain('Crea tu perfil de negocio');
    expect(stepCards[1].textContent).toContain('PASO 2');
    expect(stepCards[1].textContent).toContain('Publica tu contenido');
    expect(stepCards[2].textContent).toContain('PASO 3');
    expect(stepCards[2].textContent).toContain('Promociona publicaciones clave');
    expect(stepCards[3].textContent).toContain('PASO 4');
    expect(stepCards[3].textContent).toContain('Monitorea la interacción');

    i18n.setLang('en');
    fixture.detectChanges();
  });

  it('should display friendly notice banner when session expired reason or storage flag is set', async () => {
    sessionStorage.setItem('vamo_expired_session', 'true');
    sessionStorage.setItem('vamo_expired_return_url', '/app/promotions');

    const expiredFixture = TestBed.createComponent(LoginComponent);
    const expiredComp = expiredFixture.componentInstance;
    expiredFixture.detectChanges();

    expect(expiredComp.sessionExpiredNotice).toBe(true);
    const alertWarning = expiredFixture.nativeElement.querySelector('.alert-warning');
    expect(alertWarning).toBeTruthy();
    expect(alertWarning.textContent).toContain('Your session expired. Please sign in again.');

    sessionStorage.clear();
  });

  it('should clear session expiry flags upon successful login and navigate to sanitized returnUrl', async () => {
    sessionStorage.setItem('vamo_expired_session', 'true');
    sessionStorage.setItem('vamo_expired_return_url', '/app/promotions');

    const loginFixture = TestBed.createComponent(LoginComponent);
    const loginComp = loginFixture.componentInstance;
    loginFixture.detectChanges();

    authServiceSpy.login.mockResolvedValue({
      id: 'usr-1',
      email: 'owner@beachbar.com',
      provider_link: { id: 'prov-1', name: 'Beach Bar' },
    });

    loginComp.email = 'owner@beachbar.com';
    loginComp.password = 'password123';
    await loginComp.onSubmit();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/promotions');
    expect(sessionStorage.getItem('vamo_expired_session')).toBeNull();
    expect(sessionStorage.getItem('vamo_expired_return_url')).toBeNull();

    sessionStorage.clear();
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

  describe('Reactive Language Switching Parity', () => {
    let i18n: I18nService;

    beforeEach(() => {
      i18n = TestBed.inject(I18nService);
      i18n.setLang('en');
    });

    afterEach(() => {
      i18n.setLang('en');
    });

    it('should dynamically switch invalid-password error between EN and ES without retrying login', async () => {
      // Step A: language EN -> bad password -> English error shown
      i18n.setLang('en');
      authServiceSpy.login.mockRejectedValue({
        errors: [{ extensions: { code: 'INVALID_CREDENTIALS' } }],
      });

      component.email = 'wrong@vamo.com';
      component.password = 'badpassword';
      await component.onSubmit();
      fixture.detectChanges();

      const enExpected = 'Invalid email or password. Please check your credentials and try again.';
      expect(component.errorMessage).toBe(enExpected);
      const alert = fixture.nativeElement.querySelector('.alert-error');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain(enExpected);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);

      // Step B: while error remains visible, switch to ES without another login attempt
      i18n.setLang('es');
      fixture.detectChanges();

      const esExpected = 'Correo o contraseña no válidos. Por favor verifica tus credenciales y vuelve a intentarlo.';
      expect(component.errorMessage).toBe(esExpected);
      expect(alert.textContent).toContain(esExpected);
      // Verify no second login attempt was made
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);

      // Step C: switch back to EN -> error becomes English
      i18n.setLang('en');
      fixture.detectChanges();

      expect(component.errorMessage).toBe(enExpected);
      expect(alert.textContent).toContain(enExpected);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);
    });

    it('should dynamically switch login timeout error between EN and ES without retrying login', async () => {
      i18n.setLang('en');
      const timeoutErr = new Error('Timeout');
      (timeoutErr as any).code = 'LOGIN_TIMEOUT';
      authServiceSpy.login.mockRejectedValue(timeoutErr);

      component.email = 'operator@business.com';
      component.password = 'secret';
      await component.onSubmit();
      fixture.detectChanges();

      const enExpected = 'The sign-in request timed out. Please check your connection and try again.';
      const esExpected = 'La solicitud de inicio de sesión ha caducado. Por favor comprueba tu conexión e inténtalo de nuevo.';

      expect(component.errorMessage).toBe(enExpected);
      const alert = fixture.nativeElement.querySelector('.alert-error');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain(enExpected);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);

      // Switch to ES
      i18n.setLang('es');
      fixture.detectChanges();
      expect(component.errorMessage).toBe(esExpected);
      expect(alert.textContent).toContain(esExpected);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);

      // Switch back to EN
      i18n.setLang('en');
      fixture.detectChanges();
      expect(component.errorMessage).toBe(enExpected);
      expect(alert.textContent).toContain(enExpected);
      expect(authServiceSpy.login).toHaveBeenCalledTimes(1);
    });

    it('should dynamically switch Google error states between EN and ES', () => {
      // 1. Google Cancelled
      i18n.setLang('en');
      (component as any).handleGoogleError(new Error('GOOGLE_CANCELLED'));
      fixture.detectChanges();
      expect(component.errorMessage).toBe('Google Sign-In was cancelled.');
      i18n.setLang('es');
      fixture.detectChanges();
      expect(component.errorMessage).toBe('Se canceló el inicio de sesión con Google.');

      // 2. Google Unavailable
      i18n.setLang('en');
      (component as any).handleGoogleError(new Error('GOOGLE_SDK_UNAVAILABLE'));
      fixture.detectChanges();
      expect(component.errorMessage).toBe('Google Sign-In is currently unavailable. Please try again or use email and password.');
      i18n.setLang('es');
      fixture.detectChanges();
      expect(component.errorMessage).toBe('El inicio de sesión con Google no está disponible actualmente. Inténtalo de nuevo o usa correo y contraseña.');

      // 3. Google Token Missing
      i18n.setLang('en');
      (component as any).handleGoogleError(new Error('GOOGLE_TOKEN_MISSING'));
      fixture.detectChanges();
      expect(component.errorMessage).toBe('Could not retrieve your Google credentials. Please try again.');
      i18n.setLang('es');
      fixture.detectChanges();
      expect(component.errorMessage).toBe('No se pudieron obtener las credenciales de Google. Por favor, inténtalo de nuevo.');
    });

    it('should dynamically switch password reset success message between EN and ES', async () => {
      i18n.setLang('en');
      authServiceSpy.requestPasswordReset.mockResolvedValue({});

      component.forgotEmail = 'operator@business.com';
      await component.sendPasswordReset();
      fixture.detectChanges();

      const enExpected = 'A password reset link has been dispatched to operator@business.com. Please check your inbox.';
      const esExpected = '¡Enlace enviado a operator@business.com! Revisa tu correo.';

      expect(component.successMessage).toBe(enExpected);
      const alert = fixture.nativeElement.querySelector('.alert-success');
      expect(alert.textContent).toContain(enExpected);

      // Switch to ES
      i18n.setLang('es');
      fixture.detectChanges();
      expect(component.successMessage).toBe(esExpected);
      expect(alert.textContent).toContain(esExpected);

      // Switch back to EN
      i18n.setLang('en');
      fixture.detectChanges();
      expect(component.successMessage).toBe(enExpected);
      expect(alert.textContent).toContain(enExpected);
    });
  });
});
