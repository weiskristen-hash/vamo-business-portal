import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from './auth.service';
import {
  AppleAuthService,
  AppleAuthError,
  AppleJwks,
  APPLE_JWKS_URL,
} from './apple-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { LoginComponent } from '../../pages/auth/login/login.component';
import {
  runtimeConfig,
  isStagingPortalHost,
  resolveAppleRedirectUri,
} from '../config/runtime-config';
import { I18nService } from '../i18n/i18n.service';
import { createBrowserAuthStorage } from '../directus/browser-auth.storage';

function toBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64UrlJson(obj: unknown): string {
  return toBase64UrlBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

describe('Apple Web Sign-In & JWT Security Specifications', () => {
  let authService: AuthService;
  let appleAuthService: AppleAuthService;
  let routerSpy: any;
  let originalFetch: typeof globalThis.fetch;

  let validPrivateKey: CryptoKey;
  let attackerPrivateKey: CryptoKey;
  let testJwks: AppleJwks;

  async function signAppleTestJwt(
    payloadOverrides: Record<string, any> = {},
    options: {
      kid?: string;
      alg?: string;
      privateKey?: CryptoKey;
      tamperSignature?: boolean;
    } = {}
  ): Promise<string> {
    const header = {
      alg: options.alg ?? 'RS256',
      kid: options.kid ?? 'apple-test-key-1',
    };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://appleid.apple.com',
      aud: 'com.vamoapp.vamomobile.signin',
      sub: 'apple-user-001',
      iat: nowSec - 10,
      exp: nowSec + 600,
      email: 'camila@privaterelay.appleid.com',
      ...payloadOverrides,
    };

    const headerB64 = toBase64UrlJson(header);
    const payloadB64 = toBase64UrlJson(payload);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const sigBuffer = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      options.privateKey ?? validPrivateKey,
      signingInput
    );
    const sigBytes = new Uint8Array(sigBuffer);
    if (options.tamperSignature) {
      sigBytes[0] ^= 0xff;
      sigBytes[1] ^= 0xaa;
    }

    return `${headerB64}.${payloadB64}.${toBase64UrlBytes(sigBytes)}`;
  }

  beforeAll(async () => {
    const validKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    validPrivateKey = validKeyPair.privateKey;
    const publicJwk = await crypto.subtle.exportKey('jwk', validKeyPair.publicKey);

    const attackerKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    attackerPrivateKey = attackerKeyPair.privateKey;

    testJwks = {
      keys: [
        {
          kty: 'RSA',
          kid: 'apple-test-key-1',
          use: 'sig',
          alg: 'RS256',
          n: publicJwk.n!,
          e: publicJwk.e!,
        },
      ],
    };
  });

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
    appleAuthService.setJwksCache(testJwks);

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
            id_token: await signAppleTestJwt({
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
            id_token: await signAppleTestJwt({
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
            id_token: await signAppleTestJwt({
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
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: await signAppleTestJwt({ nonce: capturedInitConfig.nonce }),
            state: 'tampered-state',
          },
        })),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'STATE_MISMATCH',
    });
  });

  it('6. Rejects when JWT nonce claim does not match generated nonce or is omitted', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: await signAppleTestJwt({
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

    // Also reject when nonce claim is omitted from JWT payload
    (window as any).AppleID.auth.signIn = vi.fn(async () => ({
      authorization: {
        id_token: await signAppleTestJwt({ nonce: undefined }),
        state: capturedInitConfig.state,
      },
    }));

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'NONCE_MISMATCH',
    });
  });

  it('6b. Accepts SHA-256 hex digest nonce in Apple identity_token when matching generated nonce', async () => {
    let capturedInitConfig: any = null;
    (window as any).AppleID = {
      auth: {
        init: vi.fn((cfg: any) => {
          capturedInitConfig = cfg;
        }),
        signIn: vi.fn(async () => ({
          authorization: {
            id_token: await signAppleTestJwt({
              nonce: await appleAuthService.sha256Hex(capturedInitConfig.nonce),
            }),
            state: capturedInitConfig.state,
          },
        })),
      },
    };

    const result = await appleAuthService.signIn();
    expect(result.identityToken).toBeTruthy();
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

  it('8b. Handles SDK initialization failure and script load failure safely', async () => {
    (window as any).AppleID = {
      auth: {
        init: vi.fn(() => {
          throw new Error('AppleID init failed');
        }),
        signIn: vi.fn(),
      },
    };

    await expect(appleAuthService.signIn()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('9. Directus Apple Sign-In flow call sends verified identity_token and user_name to 7adc18dc-af9b-43d5-a2b7-2c7770760ec8', async () => {
    let calledUrl = '';
    let capturedBody: any = null;
    const validJwt = await signAppleTestJwt();

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

    await authService.loginWithAppleCredential(validJwt, {
      firstName: 'Camila',
      lastName: 'Rojas',
    });

    expect(runtimeConfig.appleSignInFlow).toBe('7adc18dc-af9b-43d5-a2b7-2c7770760ec8');
    expect(calledUrl).toBe(
      `${runtimeConfig.directusUrl}/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8`
    );
    expect(capturedBody).toEqual({
      identity_token: validJwt,
      user_name: {
        firstName: 'Camila',
        lastName: 'Rojas',
      },
    });
  });

  it('10. Directus Apple flow failure status (401, 500) throws APPLE_FLOW_FAILED_<status>', async () => {
    const validJwt = await signAppleTestJwt();
    for (const status of [401, 500]) {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status }));
      await expect(authService.loginWithAppleCredential(validJwt)).rejects.toThrow(
        `APPLE_FLOW_FAILED_${status}`
      );
    }
  });

  it('11. Malformed Directus response throws MALFORMED_FLOW_RESPONSE', async () => {
    const validJwt = await signAppleTestJwt();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'no_access_token' }), { status: 200 })
    );
    await expect(authService.loginWithAppleCredential(validJwt)).rejects.toThrow(
      'MALFORMED_FLOW_RESPONSE'
    );
  });

  it('12. Session storage persistence saves access_token, refresh_token, expires, and expires_at without erasing refresh_token', async () => {
    const validJwt = await signAppleTestJwt();
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

    const user = await authService.loginWithAppleCredential(validJwt);
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

    // Token missing / state mismatch / invalid signature
    i18n.setLang('en');
    (comp as any).handleAppleError(new AppleAuthError('Invalid signature', 'INVALID_SIGNATURE'));
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

  describe('Apple JWT Signature & Claims Security Verification', () => {
    it('15. Verifies valid RS256 signature against Apple JWKS fetched from https://appleid.apple.com/auth/keys', async () => {
      appleAuthService.setJwksCache(null);
      const validJwt = await signAppleTestJwt({ sub: 'apple-verified-sub' });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === APPLE_JWKS_URL) {
          return new Response(JSON.stringify(testJwks), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const payload = await appleAuthService.verifyIdentityToken(validJwt);
      expect(payload.sub).toBe('apple-verified-sub');
      expect(payload.iss).toBe('https://appleid.apple.com');
      expect(payload.aud).toBe('com.vamoapp.vamomobile.signin');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        APPLE_JWKS_URL,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('16. Rejects tampered JWT signature or JWT signed by an untrusted RSA private key before calling Directus flow', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      // Case A: Signature bytes tampered
      const tamperedJwt = await signAppleTestJwt({}, { tamperSignature: true });
      await expect(authService.loginWithAppleCredential(tamperedJwt)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
      });

      // Case B: Signed with attacker's RSA keypair using same kid
      const forgedJwt = await signAppleTestJwt({}, { privateKey: attackerPrivateKey });
      await expect(authService.loginWithAppleCredential(forgedJwt)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
      });

      // Case C: Unknown kid not in Apple JWKS
      appleAuthService.setJwksCache(testJwks);
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(testJwks), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const unknownKidJwt = await signAppleTestJwt({}, { kid: 'unknown-apple-key-999' });
      await expect(appleAuthService.verifyIdentityToken(unknownKidJwt)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
      });

      // Verify Directus flow endpoint was never called for any invalid signature
      expect(
        fetchSpy.mock.calls.some(([url]) => String(url).includes('/flows/trigger/'))
      ).toBe(false);
    });

    it('17. Rejects incorrect Apple token audience (aud)', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      // Wrong audience (e.g. another app or native iOS bundle ID instead of web Services ID)
      const wrongAudJwt = await signAppleTestJwt({ aud: 'com.vamoapp.vamomobile' });
      await expect(authService.loginWithAppleCredential(wrongAudJwt)).rejects.toMatchObject({
        code: 'INVALID_AUDIENCE',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('18. Rejects expired Apple tokens (exp in the past)', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const expiredJwt = await signAppleTestJwt({
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      await expect(authService.loginWithAppleCredential(expiredJwt)).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('19. Rejects wrong issuer (iss !== https://appleid.apple.com)', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const wrongIssuerJwt = await signAppleTestJwt({
        iss: 'https://accounts.google.com',
      });
      await expect(authService.loginWithAppleCredential(wrongIssuerJwt)).rejects.toMatchObject({
        code: 'INVALID_ISSUER',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('20. Rejects alg: none or malformed JWT headers and never logs sensitive identity tokens', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const unsignedAlgNone = `${toBase64UrlJson({ alg: 'none', kid: 'apple-test-key-1' })}.${toBase64UrlJson({
        iss: 'https://appleid.apple.com',
        aud: 'com.vamoapp.vamomobile.signin',
        sub: 'victim-sub',
        exp: Math.floor(Date.now() / 1000) + 600,
      })}.sig`;

      await expect(appleAuthService.verifyIdentityToken(unsignedAlgNone)).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });

      const loggedArgs = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleWarnSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ]
        .map((v) => String(v))
        .join(' ');
      expect(loggedArgs).not.toContain(unsignedAlgNone);
    });

    it('21. Allows configuring Apple redirect URI for staging without disrupting production callback or credit-card flows', async () => {
      // Production callback is the default
      runtimeConfig.reset();
      expect(runtimeConfig.appleRedirectUri).toBe('https://business.vamo-app.com/auth/callback');

      // Staging redirect URI can be configured via setAppleRedirectUri
      runtimeConfig.setAppleRedirectUri('https://staging-business.vamo-app.com/auth/callback/');
      expect(runtimeConfig.appleRedirectUri).toBe('https://staging-business.vamo-app.com/auth/callback');

      // Untrusted redirect URI host is rejected
      runtimeConfig.setAppleRedirectUri('https://evil.example.com/auth/callback');
      expect(runtimeConfig.appleRedirectUri).toBe('https://staging-business.vamo-app.com/auth/callback');

      // AppleID.auth.init receives the staging redirect URI when configured
      let capturedConfig: any = null;
      (window as any).AppleID = {
        auth: {
          init: vi.fn((cfg: any) => {
            capturedConfig = cfg;
          }),
          signIn: vi.fn(async () => ({
            authorization: {
              state: capturedConfig.state,
              id_token: await signAppleTestJwt({ nonce: capturedConfig.nonce }),
            },
          })),
        },
      };

      await appleAuthService.signIn();
      expect(capturedConfig.redirectURI).toBe('https://staging-business.vamo-app.com/auth/callback');

      // Resetting restores the production callback without affecting dev Directus credit-card flows
      runtimeConfig.reset();
      expect(runtimeConfig.appleRedirectUri).toBe('https://business.vamo-app.com/auth/callback');
      expect(isStagingPortalHost('staging-business.vamo-app.com')).toBe(true);
      expect(isStagingPortalHost('business-staging.islavibe-dr.workers.dev')).toBe(true);
      expect(isStagingPortalHost('business.vamo-app.com')).toBe(false);
      expect(resolveAppleRedirectUri({}, 'staging-business.vamo-app.com')).toBe(
        'https://staging-business.vamo-app.com/auth/callback'
      );
      expect(resolveAppleRedirectUri({}, 'business.vamo-app.com')).toBe(
        'https://business.vamo-app.com/auth/callback'
      );
      runtimeConfig.setDirectusUrl('https://quepasa-api.c1oud7.de');
      expect(runtimeConfig.stripeCreateSetupIntentFlow).toBeTruthy();
      expect(runtimeConfig.appleClientId).toBe('com.vamoapp.vamomobile.signin');
    });
  });
});
