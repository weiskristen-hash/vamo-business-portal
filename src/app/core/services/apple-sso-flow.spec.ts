import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { BusinessService } from './business.service';
import { CustomerErrorService } from './customer-error.service';
import { LoginComponent } from '../../pages/auth/login/login.component';
import { RegisterComponent } from '../../pages/auth/register/register.component';
import { OnboardingComponent } from '../../pages/auth/onboarding/onboarding.component';
import { SsoCallbackComponent } from '../../pages/auth/callback/sso-callback.component';
import { runtimeConfig } from '../config/runtime-config';
import { I18nService } from '../i18n/i18n.service';
import { appleAuthErrorKey } from '../utils/apple-auth-error';

describe('Apple Sign-In Flow — Stage 2B Security & Integration Specifications', () => {
  let authService: AuthService;
  let routerSpy: any;
  let routeQueryParams: Record<string, any>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    originalFetch = globalThis.fetch;
    routeQueryParams = {};

    routerSpy = {
      url: '/login',
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn((commands: any[]) => ({ toString: () => commands.join('/') })),
      serializeUrl: vi.fn((tree: any) => (tree?.toString ? tree.toString() : String(tree))),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: GoogleAuthService,
          useValue: {
            loadGoogleScript: vi.fn().mockResolvedValue(undefined),
            isLoaded: vi.fn().mockReturnValue(false),
            renderButton: vi.fn(),
            promptForIdToken: vi.fn(),
          },
        },
        {
          provide: BusinessService,
          useValue: {
            getAreas: vi.fn().mockResolvedValue([
              {
                id: 'area-lt',
                name: 'Las Terrenas/Samana',
                slug: 'las_terrenas',
                emoji: '🏖️',
                latitude: 19.31,
                longitude: -69.5444,
              },
            ]),
          },
        },
        CustomerErrorService,
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParams() {
                return routeQueryParams;
              },
              queryParamMap: {
                get: (key: string) => routeQueryParams[key] ?? null,
              },
              routeConfig: { path: 'login' },
            },
          },
        },
      ],
    });

    authService = TestBed.inject(AuthService);
    runtimeConfig.reset();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/auth/callback');

    const i18n = TestBed.inject(I18nService);
    i18n.setLang('en');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  // 1. Authorization URL construction & CSRF state/nonce generation
  it('1. buildAppleAuthorizeUrl constructs canonical Apple OAuth URL with Services ID, Directus callback, base64url state, and CSPRNG nonce', () => {
    const first = authService.buildAppleAuthorizeUrl('https://staging-business.vamo-app.com');
    const second = authService.buildAppleAuthorizeUrl('https://staging-business.vamo-app.com');

    expect(first.url.startsWith('https://appleid.apple.com/auth/authorize?')).toBe(true);
    const parsedUrl = new URL(first.url);

    expect(parsedUrl.searchParams.get('client_id')).toBe('com.vamoapp.vamomobile.signin');
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(
      `${runtimeConfig.directusUrl}/vamo-auth/apple/callback`
    );
    expect(parsedUrl.searchParams.get('response_type')).toBe('code id_token');
    expect(parsedUrl.searchParams.get('response_mode')).toBe('form_post');
    expect(parsedUrl.searchParams.get('scope')).toBe('name email');
    expect(parsedUrl.searchParams.get('state')).toBe(first.state);
    expect(parsedUrl.searchParams.get('nonce')).toBe(first.nonce);

    // Nonce & state must be unique 32-hex-char CSPRNG tokens on each call
    expect(first.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(second.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.state).not.toBe(second.state);

    // Decode base64url state and verify payload matches vamo-auth contract { t: 'web', o, r }
    const base64 = first.state.replace(/-/g, '+').replace(/_/g, '/');
    const decodedState = JSON.parse(atob(base64));
    expect(decodedState.t).toBe('web');
    expect(decodedState.o).toBe('https://staging-business.vamo-app.com');
    expect(decodedState.r).toMatch(/^[0-9a-f]{32}$/);
  });

  // 2. loginWithApple & loginWithProvider('apple') store sessionStorage state and redirect
  it('2. loginWithProvider("apple") delegates to loginWithApple, stores single-use state/nonce in sessionStorage, and redirects to Apple', () => {
    let redirectedUrl = '';
    vi.spyOn(authService as any, 'navigateToExternalUrl').mockImplementation((url: any) => {
      redirectedUrl = String(url);
    });

    authService.loginWithProvider('apple', '/app/listings', 'business');

    expect(redirectedUrl).toContain('https://appleid.apple.com/auth/authorize?');
    expect(redirectedUrl).not.toContain('/auth/login/apple');

    const storedRaw = sessionStorage.getItem('appleWebAuth');
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw!);
    expect(stored.state).toBeTruthy();
    expect(stored.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof stored.createdAt).toBe('number');

    expect(sessionStorage.getItem('vamo_auth_return_url')).toBe('/app/listings');
    expect(sessionStorage.getItem('vamo_auth_signup_intent')).toBe('business');
  });

  // 3. Token exchange with POST /vamo-auth/apple
  it('3. loginWithAppleCredential sends POST /vamo-auth/apple with identity_token, nonce, first_name, last_name and calls handleSsoTokens', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'apple_directus_access_jwt',
            refresh_token: 'apple_directus_refresh_token',
            expires: 900000,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const ssoSpy = vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({
      id: 'usr-apple-1',
      email: 'privaterelay@privaterelay.appleid.com',
      provider_link: { id: 'prov-1', name: 'Cabarete Kite Club' },
    } as any);

    const user = await authService.loginWithAppleCredential(
      'apple_id_token_jwt',
      'nonce_hex_1234',
      'Lucia',
      'Mendez'
    );

    expect(capturedUrl).toBe(`${runtimeConfig.directusUrl}/vamo-auth/apple`);
    expect(capturedBody).toEqual({
      identity_token: 'apple_id_token_jwt',
      nonce: 'nonce_hex_1234',
      first_name: 'Lucia',
      last_name: 'Mendez',
    });
    expect(ssoSpy).toHaveBeenCalledWith('apple_directus_access_jwt', 'apple_directus_refresh_token', 900000);
    expect(user.id).toBe('usr-apple-1');
  });

  // 4. Subsequent logins without first/last name send empty strings and succeed
  it('4. loginWithAppleCredential sends empty strings for first_name and last_name on returning Apple logins', async () => {
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          data: {
            access_token: 'apple_access_2',
            refresh_token: 'apple_refresh_2',
            expires: 900000,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-apple-2' } as any);

    await authService.loginWithAppleCredential('apple_id_token_2', 'nonce_2');

    expect(capturedBody).toEqual({
      identity_token: 'apple_id_token_2',
      nonce: 'nonce_2',
      first_name: '',
      last_name: '',
    });
  });

  // 5. Callback fragment validation: state match, single-use replay protection, and user name extraction
  it('5. handleAppleCallbackFragment validates state, extracts first-login user name, and consumes appleWebAuth so replay fails', async () => {
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'valid_state_abc',
        nonce: 'valid_nonce_xyz',
        createdAt: Date.now(),
      })
    );

    const credSpy = vi.spyOn(authService, 'loginWithAppleCredential').mockResolvedValue({
      id: 'usr-apple-new',
      first_name: 'Mateo',
      last_name: 'Santos',
    } as any);

    const hashParams = new URLSearchParams({
      provider: 'apple',
      id_token: 'apple_callback_jwt',
      state: 'valid_state_abc',
      user: JSON.stringify({
        name: { firstName: 'Mateo', lastName: 'Santos' },
        email: 'mateo@privaterelay.appleid.com',
      }),
    });

    const user = await authService.handleAppleCallbackFragment(hashParams);
    expect(user.id).toBe('usr-apple-new');
    expect(credSpy).toHaveBeenCalledWith('apple_callback_jwt', 'valid_nonce_xyz', 'Mateo', 'Santos');

    // appleWebAuth must be removed from sessionStorage immediately (single-use)
    expect(sessionStorage.getItem('appleWebAuth')).toBeNull();

    // Replaying the exact same callback fragment must fail with APPLE_STATE_MISMATCH
    await expect(authService.handleAppleCallbackFragment(hashParams)).rejects.toThrow('APPLE_STATE_MISMATCH');
  });

  // 6. Callback fragment validation rejects tampered state, missing state, and expired state
  it('6. handleAppleCallbackFragment rejects tampered state, missing session state, and expired state', async () => {
    // Missing sessionStorage state
    const params1 = new URLSearchParams({
      provider: 'apple',
      id_token: 'jwt_1',
      state: 'some_state',
    });
    await expect(authService.handleAppleCallbackFragment(params1)).rejects.toThrow('APPLE_STATE_MISMATCH');

    // Tampered / mismatched state
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'expected_state_111',
        nonce: 'nonce_111',
        createdAt: Date.now(),
      })
    );
    const params2 = new URLSearchParams({
      provider: 'apple',
      id_token: 'jwt_1',
      state: 'attacker_state_222',
    });
    await expect(authService.handleAppleCallbackFragment(params2)).rejects.toThrow('APPLE_STATE_MISMATCH');
    expect(sessionStorage.getItem('appleWebAuth')).toBeNull();

    // Expired state (> 10 minutes old)
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'expired_state_333',
        nonce: 'nonce_333',
        createdAt: Date.now() - 11 * 60 * 1000,
      })
    );
    const params3 = new URLSearchParams({
      provider: 'apple',
      id_token: 'jwt_1',
      state: 'expired_state_333',
    });
    await expect(authService.handleAppleCallbackFragment(params3)).rejects.toThrow('APPLE_STATE_EXPIRED');
  });

  // 7. vamo-auth backend error codes map to structured customer-safe errors in EN and ES
  it('7. maps vamo-auth error codes (INVALID_TOKEN, ACCOUNT_CONFLICT, ADMIN_ACCOUNT, TFA_ENABLED, USER_INACTIVE, PROVIDER_MISMATCH, EMAIL_NOT_VERIFIED) to customer-safe EN and ES messages', async () => {
    const codes = [
      { code: 'INVALID_TOKEN', status: 401, expectedKey: 'AUTH.APPLE_TOKEN_MISSING' },
      { code: 'ACCOUNT_CONFLICT', status: 409, expectedKey: 'AUTH.APPLE_ACCOUNT_CONFLICT' },
      { code: 'ADMIN_ACCOUNT', status: 403, expectedKey: 'AUTH.APPLE_ADMIN_FORBIDDEN' },
      { code: 'TFA_ENABLED', status: 403, expectedKey: 'AUTH.APPLE_TFA_REQUIRED' },
      { code: 'USER_INACTIVE', status: 403, expectedKey: 'AUTH.APPLE_ACCOUNT_INACTIVE' },
      { code: 'PROVIDER_MISMATCH', status: 403, expectedKey: 'AUTH.APPLE_PROVIDER_MISMATCH' },
      { code: 'EMAIL_NOT_VERIFIED', status: 403, expectedKey: 'AUTH.APPLE_EMAIL_REQUIRED' },
    ];

    const i18n = TestBed.inject(I18nService);

    for (const item of codes) {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: `Internal Directus error for ${item.code}`,
                extensions: { code: item.code },
              },
            ],
          }),
          { status: item.status, headers: { 'Content-Type': 'application/json' } }
        )
      );

      let caughtError: Error | null = null;
      try {
        await authService.loginWithAppleCredential('sample_jwt', 'sample_nonce');
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeTruthy();
      expect(caughtError?.message).toBe(item.code);

      const key = appleAuthErrorKey(caughtError);
      expect(key).toBe(item.expectedKey);

      i18n.setLang('en');
      const enText = i18n.t(key);
      expect(enText).not.toBe(key);
      expect(enText.toLowerCase()).not.toContain('directus');

      i18n.setLang('es');
      const esText = i18n.t(key);
      expect(esText).not.toBe(key);
      expect(esText).not.toBe(enText);
      expect(esText.toLowerCase()).not.toContain('directus');
    }

    i18n.setLang('en');
  });

  // 8. SsoCallbackComponent scrubs URL fragment immediately and routes linked business owner to /app/overview
  it('8. SsoCallbackComponent scrubs #provider=apple fragment immediately and routes linked business owner to /app/overview', async () => {
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'cb_state_1',
        nonce: 'cb_nonce_1',
        createdAt: Date.now(),
      })
    );

    window.history.replaceState(
      null,
      '',
      '/auth/callback#provider=apple&id_token=secret_apple_jwt_999&state=cb_state_1'
    );
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    vi.spyOn(authService, 'loginWithAppleCredential').mockResolvedValue({
      id: 'usr-linked-apple',
      provider_link: { id: 'prov-99', name: 'Punta Cana Dive Center' },
    } as any);

    const fixture = TestBed.createComponent(SsoCallbackComponent);
    await fixture.componentInstance.ngOnInit();

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/auth/callback');
    expect(window.location.hash).toBe('');
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
  });

  // 9. SsoCallbackComponent routes unlinked business signup user to /onboarding?social=business
  it('9. SsoCallbackComponent routes unlinked user with business signupIntent to /onboarding?social=business', async () => {
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'cb_state_biz',
        nonce: 'cb_nonce_biz',
        createdAt: Date.now(),
      })
    );
    sessionStorage.setItem('vamo_auth_signup_intent', 'business');
    sessionStorage.setItem('vamo_auth_return_url', '/app/listings/create');

    window.history.replaceState(
      null,
      '',
      '/auth/callback#provider=apple&id_token=new_owner_jwt&state=cb_state_biz'
    );

    vi.spyOn(authService, 'loginWithAppleCredential').mockResolvedValue({
      id: 'usr-new-apple',
      provider_link: null,
    } as any);

    const fixture = TestBed.createComponent(SsoCallbackComponent);
    await fixture.componentInstance.ngOnInit();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/onboarding'], {
      queryParams: { social: 'business' },
    });
  });

  // 10. SsoCallbackComponent handles Apple user cancellation cleanly
  it('10. SsoCallbackComponent handles user_cancelled_authorize by scrubbing URL, clearing state, and redirecting to /login?error=APPLE_CANCELLED', async () => {
    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'cb_state_cancel',
        nonce: 'cb_nonce_cancel',
        createdAt: Date.now(),
      })
    );

    window.history.replaceState(
      null,
      '',
      '/auth/callback#provider=apple&state=cb_state_cancel&error=user_cancelled_authorize'
    );

    const fixture = TestBed.createComponent(SsoCallbackComponent);
    await fixture.componentInstance.ngOnInit();

    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('appleWebAuth')).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { error: 'APPLE_CANCELLED' },
    });
  });

  // 11. LoginComponent displays localized Apple cancellation and error messages in EN and ES
  it('11. LoginComponent translates APPLE_CANCELLED and ACCOUNT_CONFLICT query errors in EN and ES', () => {
    routeQueryParams = { error: 'APPLE_CANCELLED' };
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const i18n = TestBed.inject(I18nService);
    i18n.setLang('en');
    expect(comp.errorMessage).toBe('Apple Sign-In was cancelled.');

    i18n.setLang('es');
    expect(comp.errorMessage).toBe('Se canceló el inicio de sesión con Apple.');

    routeQueryParams = { error: 'ACCOUNT_CONFLICT', provider: 'apple' };
    const fixture2 = TestBed.createComponent(LoginComponent);
    const comp2 = fixture2.componentInstance;
    fixture2.detectChanges();

    i18n.setLang('en');
    expect(comp2.errorMessage).toContain('already linked to a different Apple account');

    i18n.setLang('es');
    expect(comp2.errorMessage).toContain('ya está vinculado a otra cuenta de Apple');

    i18n.setLang('en');
  });

  // 12. OnboardingComponent preserves selectedArea (ob_area) across Apple redirect and resumes at business-details
  it('12. OnboardingComponent persists ob_area before Apple redirect and restores it on /onboarding?social=business', async () => {
    let redirectedUrl = '';
    vi.spyOn(authService as any, 'navigateToExternalUrl').mockImplementation((url: any) => {
      redirectedUrl = String(url);
    });

    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const selectedArea = {
      id: 'area-lt',
      name: 'Las Terrenas/Samana',
      slug: 'las_terrenas',
      emoji: '🏖️',
      latitude: 19.31,
      longitude: -69.5444,
    };
    comp.selectedArea.set(selectedArea);
    comp.onAppleSignUp();

    expect(redirectedUrl).toContain('https://appleid.apple.com/auth/authorize?');
    expect(sessionStorage.getItem('vamo_auth_signup_intent')).toBe('business');
    expect(JSON.parse(sessionStorage.getItem('ob_area')!)).toEqual(selectedArea);

    // Simulate returning from Apple callback as an authenticated unlinked user on /onboarding?social=business
    routeQueryParams = { social: 'business' };
    vi.spyOn(authService, 'currentUser', 'get').mockReturnValue({
      id: 'usr-apple-onboard',
      first_name: 'Camila',
      last_name: 'Vega',
      email: 'camila@privaterelay.appleid.com',
      provider_link: null,
    } as any);

    const returnFixture = TestBed.createComponent(OnboardingComponent);
    const returnComp = returnFixture.componentInstance;
    await returnComp.ngOnInit();

    expect(returnComp.currentStep()).toBe('business-details');
    expect(returnComp.selectedArea()?.id).toBe('area-lt');
    expect(returnComp.firstName).toBe('Camila');
    expect(returnComp.lastName).toBe('Vega');
  });

  // 13. Zero logging of sensitive tokens, nonces, or PII
  it('13. never logs identity_token, access_token, refresh_token, nonce, or user PII to console', async () => {
    const secretIdToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImFwcGxlX3NlY3JldF9qd3QifQ';
    const secretNonce = 'deadbeefcafebabe0123456789abcdef';
    const secretAccessToken = 'directus_secret_access_token_777';
    const secretRefreshToken = 'directus_secret_refresh_token_888';
    const secretRelayEmail = 'hidden_owner_99@privaterelay.appleid.com';

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    sessionStorage.setItem(
      'appleWebAuth',
      JSON.stringify({
        state: 'safe_state_1',
        nonce: secretNonce,
        createdAt: Date.now(),
      })
    );

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            access_token: secretAccessToken,
            refresh_token: secretRefreshToken,
            expires: 900000,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({
      id: 'usr-1',
      email: secretRelayEmail,
      provider_link: { id: 'prov-1' },
    } as any);

    const hashParams = new URLSearchParams({
      provider: 'apple',
      id_token: secretIdToken,
      state: 'safe_state_1',
      user: JSON.stringify({
        name: { firstName: 'Secret', lastName: 'Owner' },
        email: secretRelayEmail,
      }),
    });

    await authService.handleAppleCallbackFragment(hashParams);

    const assertNoSecrets = (spy: any) => {
      for (const call of spy.mock.calls) {
        const combined = call
          .map((arg: any) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
          .join(' ');
        expect(combined).not.toContain(secretIdToken);
        expect(combined).not.toContain(secretNonce);
        expect(combined).not.toContain(secretAccessToken);
        expect(combined).not.toContain(secretRefreshToken);
        expect(combined).not.toContain(secretRelayEmail);
      }
    };

    assertNoSecrets(logSpy);
    assertNoSecrets(warnSpy);
    assertNoSecrets(errorSpy);
  });

  // 14. RegisterComponent renders Apple Sign-In button and handles configuration errors safely
  it('14. RegisterComponent renders Apple Sign-In button and displays customer-safe message if client ID is missing', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const appleBtn = fixture.nativeElement.querySelector('[data-testid="apple-sign-in-btn"]');
    expect(appleBtn).toBeTruthy();

    runtimeConfig.updateConfig({ appleClientId: '' });
    comp.onAppleSignUp();

    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toContain('Apple Sign-In is currently unavailable');
  });
});
