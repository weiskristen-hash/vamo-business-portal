import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from './auth.service';
import { AppleAuthService, AppleAuthError } from './apple-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { LoginComponent } from '../../pages/auth/login/login.component';
import { runtimeConfig } from '../config/runtime-config';
import { I18nService } from '../i18n/i18n.service';
import { createBrowserAuthStorage } from '../directus/browser-auth.storage';

function makeMockJwt(payload: Record<string, any>): string {
  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'RS256', kid: 'apple-key-1' })}.${encode(payload)}.mock_sig`;
}

describe('Apple Web Sign-In Flow Specifications', () => {
  let authService: AuthService;
  let appleAuthService: AppleAuthService;
  let routerSpy: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    originalFetch = globalThis.fetch;
    delete (window as any).AppleID;

    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn((commands: any[]) => ({ toString: () => commands.join('/') })),
      serializeUrl: vi.fn((tree: any) => (tree?.toString ? tree.toString() : String(tree))),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        AppleAuthService,
        GoogleAuthService,
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: {} },
          },
        },
      ],
    });

    authService = TestBed.inject(AuthService);
    appleAuthService = TestBed.inject(AppleAuthService);

    runtimeConfig.reset();
    const i18n = TestBed.inject(I18nService);
    i18n.setLang('en');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (window as any).AppleID;
    document
      .querySelectorAll('script[src*="appleid.auth.js"]')
      .forEach((el) => el.remove());
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('1. AppleAuthService loads the official Apple JS SDK script once and resolves when AppleID.auth is present', async () => {
    const loadPromise = appleAuthService.loadScript();
    const script = document.querySelector(
      'script[src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"]'
    ) as HTMLScriptElement;
    expect(script).toBeTruthy();

    (window as any).AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
    script.onload?.(new Event('load'));

    await loadPromise;
    expect(appleAuthService.sdkReady()).toBe(true);
    expect(appleAuthService.sdkLoadFailed()).toBe(false);
  });

  it('2. AppleAuthService initializes AppleID.auth with com.vamoapp.vamomobile.signin, scope name email, redirectURI, state, nonce, and usePopup: true', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: makeMockJwt({
              iss: 'https://appleid.apple.com',
              aud: 'com.vamoapp.vamomobile.signin',
              sub: 'apple-user-001',
              nonce: capturedInitConfig.nonce,
            }),
            state: capturedInitConfig.state,
            code: 'auth-code-123',
          },
        })),
      },
    };

    const result = await appleAuthService.signIn();

    expect(capturedInitConfig).toBeTruthy();
    expect(capturedInitConfig.clientId).toBe('com.vamoapp.vamomobile.signin');
    expect(capturedInitConfig.scope).toBe('name email');
    expect(capturedInitConfig.redirectURI).toBe('https://business.vamo-app.com/auth/callback');
    expect(capturedInitConfig.usePopup).toBe(true);
    expect(typeof capturedInitConfig.state).toBe('string');
    expect(capturedInitConfig.state.length).toBeGreaterThanOrEqual(32);
    expect(typeof capturedInitConfig.nonce).toBe('string');
    expect(capturedInitConfig.nonce.length).toBeGreaterThanOrEqual(32);
    expect(result.identityToken).toContain('.');
    expect(result.userName).toBeNull();
  });

  it('3. Extracts user.name.firstName and user.name.lastName on first-time Apple authorization', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: makeMockJwt({
              iss: 'https://appleid.apple.com',
              aud: 'com.vamoapp.vamomobile.signin',
              sub: 'apple-user-first',
              nonce: capturedInitConfig.nonce,
            }),
            state: capturedInitConfig.state,
          },
          user: {
            email: 'camila@privaterelay.appleid.com',
            name: {
              firstName: 'Camila',
              lastName: 'Rojas',
            },
          },
        })),
      },
    };

    const result = await appleAuthService.signIn();
    expect(result.userName).toEqual({ firstName: 'Camila', lastName: 'Rojas' });
  });

  it('4. Subsequent user response without user object returns userName: null', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: makeMockJwt({
              iss: 'https://appleid.apple.com',
              aud: 'com.vamoapp.vamomobile.signin',
              sub: 'apple-user-returning',
              nonce: capturedInitConfig.nonce,
            }),
            state: capturedInitConfig.state,
          },
        })),
      },
    };

    const result = await appleAuthService.signIn();
    expect(result.userName).toBeNull();
  });

  it('5. Rejects when returned state does not match generated state', async () => {
    (window as any).AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: makeMockJwt({ sub: 'apple-1' }),
            state: 'tampered-state',
          },
        })),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'STATE_MISMATCH',
    });
  });

  it('6. Rejects when JWT nonce claim does not match generated nonce', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: makeMockJwt({
              sub: 'apple-1',
              nonce: 'mismatched-nonce',
            }),
            state: capturedInitConfig.state,
          },
        })),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'NONCE_MISMATCH',
    });
  });

  it('7. Rejects when id_token is missing from Apple response', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            state: capturedInitConfig.state,
          },
        })),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'TOKEN_MISSING',
    });
  });

  it('8. Handles user-canceled popup (popup_closed_by_user) with CANCELLED error code', async () => {
    (window as any).AppleID = {
      auth: {
        init: vi.fn(),
        signIn: vi.fn(async () => {
          throw { error: 'popup_closed_by_user' };
        }),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });

  it('9. Directus Apple Sign-In flow call sends identity_token and user_name to 7adc18dc-af9b-43d5-a2b7-2c7770760ec8', async () => {
    let calledUrl = '';
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          access_token: 'apple_directus_access',
          refresh_token: 'apple_directus_refresh',
          expires: 900000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({
      id: 'usr-apple-1',
      email: 'camila@apple.com',
    } as any);

    await authService.loginWithAppleCredential('mock.apple.jwt', {
      firstName: 'Camila',
      lastName: 'Rojas',
    });

    expect(runtimeConfig.appleSignInFlow).toBe('7adc18dc-af9b-43d5-a2b7-2c7770760ec8');
    expect(calledUrl).toBe(
      `${runtimeConfig.directusUrl}/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8`
    );
    expect(capturedBody).toEqual({
      identity_token: 'mock.apple.jwt',
      user_name: {
        firstName: 'Camila',
        lastName: 'Rojas',
      },
    });
  });

  it('10. Directus Apple flow failure status (401, 500) throws APPLE_FLOW_FAILED_<status>', async () => {
    for (const status of [401, 500]) {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status }));
      await expect(authService.loginWithAppleCredential('mock.apple.jwt')).rejects.toThrow(
        `APPLE_FLOW_FAILED_${status}`
      );
    }
  });

  it('11. Malformed Directus response throws MALFORMED_FLOW_RESPONSE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'no_access_token' }), { status: 200 })
    );
    await expect(authService.loginWithAppleCredential('mock.apple.jwt')).rejects.toThrow(
      'MALFORMED_FLOW_RESPONSE'
    );
  });

  it('12. Session storage persistence saves access_token, refresh_token, expires, and expires_at without erasing refresh_token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'apple_acc_123',
          refresh_token: 'apple_ref_456',
          expires: 900000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.spyOn(authService as any, 'loadCurrentUser').mockResolvedValue({
      id: 'usr-apple-1',
      email: 'camila@apple.com',
      provider_link: { id: 'prov-1' },
    });

    const user = await authService.loginWithAppleCredential('mock.apple.jwt');
    expect(user.id).toBe('usr-apple-1');

    const stored = await createBrowserAuthStorage().get();
    expect(stored?.access_token).toBe('apple_acc_123');
    expect(stored?.refresh_token).toBe('apple_ref_456');
    expect(stored?.expires).toBe(900000);
    expect(typeof stored?.expires_at).toBe('number');
  });

  it('13. Post-login navigation routes linked business user to /app/overview or returnUrl, and unlinked user to /no-business', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    // Linked business user -> /app/overview
    vi.spyOn(authService, 'loginWithApple').mockResolvedValueOnce({
      id: 'usr-apple-linked',
      email: 'owner@vamo.com',
      provider_link: { id: 'prov-1', name: 'Las Terrenas Club' },
    } as any);

    await comp.onAppleLogin();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');

    // Unlinked user -> /no-business
    routerSpy.navigate.mockClear();
    routerSpy.navigateByUrl.mockClear();
    vi.spyOn(authService, 'loginWithApple').mockResolvedValueOnce({
      id: 'usr-apple-unlinked',
      email: 'guest@vamo.com',
      provider_link: null,
    } as any);

    await comp.onAppleLogin();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  it('14. EN and ES error localization for Apple Sign-In errors', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;
    const i18n = TestBed.inject(I18nService);

    // Cancelled
    i18n.setLang('en');
    (comp as any).handleAppleError(new AppleAuthError('Cancelled', 'CANCELLED'));
    expect(comp.errorMessage).toBe('Apple Sign-In was cancelled.');
    i18n.setLang('es');
    expect(comp.errorMessage).toBe('Se canceló el inicio de sesión con Apple.');

    // Unavailable
    i18n.setLang('en');
    (comp as any).handleAppleError(new AppleAuthError('SDK load failed', 'SCRIPT_LOAD_FAILED'));
    expect(comp.errorMessage).toBe(
      'Apple Sign-In is currently unavailable. Please try again or use email and password.'
    );
    i18n.setLang('es');
    expect(comp.errorMessage).toBe(
      'El inicio de sesión con Apple no está disponible actualmente. Inténtalo de nuevo o usa correo y contraseña.'
    );

    // Token missing / state mismatch
    i18n.setLang('en');
    (comp as any).handleAppleError(new AppleAuthError('State mismatch', 'STATE_MISMATCH'));
    expect(comp.errorMessage).toBe('Could not retrieve your Apple credentials. Please try again.');
    i18n.setLang('es');
    expect(comp.errorMessage).toBe(
      'No se pudieron obtener las credenciales de Apple. Por favor, inténtalo de nuevo.'
    );

    // Flow error
    i18n.setLang('en');
    (comp as any).handleAppleError(new Error('APPLE_FLOW_FAILED_500'));
    expect(comp.errorMessage).toBe('Apple Sign-In failed. Please try again.');
    i18n.setLang('es');
    expect(comp.errorMessage).toBe(
      'Error al iniciar sesión con Apple. Por favor, inténtalo de nuevo.'
    );
  });
});
