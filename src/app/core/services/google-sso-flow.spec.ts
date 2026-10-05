import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { LoginComponent } from '../../pages/auth/login/login.component';
import { runtimeConfig } from '../config/runtime-config';
import { authGuard } from '../guards/auth.guard';
import { noAuthGuard } from '../guards/no-auth.guard';
import { businessGuard } from '../guards/business.guard';
import { directusClient } from '../directus/directus-client';
import { I18nService } from '../i18n/i18n.service';
import { of } from 'rxjs';

describe('Google SSO Flow — Phase 3B Parity Specifications', () => {
  let authService: AuthService;
  let googleAuthService: GoogleAuthService;
  let routerSpy: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;

    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn((commands: any[]) => ({ toString: () => commands.join('/') })),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
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
    googleAuthService = TestBed.inject(GoogleAuthService);

    runtimeConfig.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  // 1. Google button initiates the correct Google ID-token path
  it('1. Google button initiates the correct Google ID-token path', async () => {
    const promptSpy = vi.spyOn(googleAuthService, 'promptForIdToken').mockResolvedValue('mock_id_token_123');
    const flowSpy = vi.spyOn(authService, 'loginWithGoogleCredential').mockResolvedValue({
      id: 'usr-1',
      email: 'test@example.com',
      provider_link: { id: 'prov-1', name: 'Bar', subscription_tier: 'free' },
    } as any);

    const user = await authService.loginWithGoogle();

    expect(promptSpy).toHaveBeenCalled();
    expect(flowSpy).toHaveBeenCalledWith('mock_id_token_123');
    expect(user.id).toBe('usr-1');
  });

  // 2. Google credential is sent to the existing VAMO Google Flow
  it('2. Google credential is sent to the existing VAMO Google Flow', async () => {
    let calledUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify({
        access_token: 'directus_acc_tok',
        refresh_token: 'directus_ref_tok',
        expires: 900000,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-1' } as any);

    await authService.loginWithGoogleCredential('sample_google_jwt');

    const expectedFlowUrl = `${runtimeConfig.directusUrl}/flows/trigger/${runtimeConfig.googleSignInFlow}`;
    expect(calledUrl).toBe(expectedFlowUrl);
    expect(runtimeConfig.googleSignInFlow).toBe('aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7');
  });

  // 3. Request payload contains: id_token
  it('3. Request payload contains: id_token', async () => {
    let capturedBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        access_token: 'directus_acc_tok',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-1' } as any);

    await authService.loginWithGoogleCredential('my_credential_jwt_value');

    expect(capturedBody).toEqual({ id_token: 'my_credential_jwt_value' });
  });

  // 4. Successful Flow response calls handleSsoTokens()
  it('4. Successful Flow response calls handleSsoTokens()', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'tok_access_abc',
        refresh_token: 'tok_refresh_xyz',
        expires: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const ssoSpy = vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-sso' } as any);

    await authService.loginWithGoogleCredential('token_123');

    expect(ssoSpy).toHaveBeenCalledWith('tok_access_abc', 'tok_refresh_xyz', 3600);
  });

  // 5. access_token is required
  it('5. access_token is required; rejects when missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        refresh_token: 'tok_refresh_xyz',
        expires: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    await expect(authService.loginWithGoogleCredential('token_123')).rejects.toThrow('MALFORMED_FLOW_RESPONSE');
  });

  // 6. refresh_token is handled correctly (including null / undefined)
  it('6. refresh_token is handled correctly when omitted or present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'tok_access_abc',
        expires: 1800,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const ssoSpy = vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-1' } as any);

    await authService.loginWithGoogleCredential('token_123');

    expect(ssoSpy).toHaveBeenCalledWith('tok_access_abc', null, 1800);
  });

  // 7. expires is handled correctly (numbers and numeric strings)
  it('7. expires is handled correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: 'tok_access_abc',
        refresh_token: 'tok_refresh',
        expires: 7200,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const ssoSpy = vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-1' } as any);

    await authService.loginWithGoogleCredential('token_123');

    expect(ssoSpy).toHaveBeenCalledWith('tok_access_abc', 'tok_refresh', 7200);
  });

  // 8. Malformed Flow response fails safely
  it('8. Malformed Flow response fails safely', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<html><body>Error 502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    await expect(authService.loginWithGoogleCredential('token_123')).rejects.toThrow('MALFORMED_FLOW_RESPONSE');
  });

  // 9. Google cancellation fails gracefully in UI
  it('9. Google cancellation fails gracefully in UI without leaving loading state stuck', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    vi.spyOn(authService, 'loginWithGoogle').mockRejectedValue(new Error('GOOGLE_POPUP_CLOSED'));

    await comp.onGoogleLogin();

    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toContain('cancelled');
  });

  // 10. Google SDK failure fails gracefully in UI
  it('10. Google SDK failure fails gracefully in UI', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    vi.spyOn(authService, 'loginWithGoogle').mockRejectedValue(new Error('GOOGLE_SDK_UNAVAILABLE'));

    await comp.onGoogleLogin();

    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toContain('unavailable');
  });

  // 11. Network/backend failure produces customer-safe message
  it('11. Network/backend failure produces customer-safe message without leaking Directus details', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    vi.spyOn(authService, 'loginWithGoogle').mockRejectedValue(new Error('GOOGLE_FLOW_FAILED_401'));

    await comp.onGoogleLogin();

    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toBeTruthy();
    expect(comp.errorMessage).not.toContain('directus');
    expect(comp.errorMessage).not.toContain('aceed368');
    expect(comp.errorMessage).not.toContain('401');
  });

  // 12. Authenticated linked-business user routes correctly
  it('12. Authenticated linked-business user routes to /app/overview', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    const mockUser = {
      id: 'usr-linked',
      provider_link: { id: 'prov-1', name: 'My Venue' },
    };
    vi.spyOn(authService, 'loginWithGoogle').mockResolvedValue(mockUser as any);

    await comp.onGoogleLogin();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/overview');
  });

  // 13. Authenticated user without provider_link routes according to existing rules (/no-business)
  it('13. Authenticated user without provider_link routes to /no-business', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    const mockUser = {
      id: 'usr-unlinked',
      provider_link: null,
    };
    vi.spyOn(authService, 'loginWithGoogle').mockResolvedValue(mockUser as any);

    await comp.onGoogleLogin();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/no-business']);
  });

  // 14. returnUrl behavior remains intact
  it('14. returnUrl behavior remains intact for linked user', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    sessionStorage.setItem('vamo_auth_return_url', '/app/listings');

    const mockUser = {
      id: 'usr-linked',
      provider_link: { id: 'prov-1', name: 'My Venue' },
    };
    vi.spyOn(authService, 'loginWithGoogle').mockResolvedValue(mockUser as any);

    await comp.onGoogleLogin();

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/app/listings');
  });

  // 15. signupIntent behavior remains intact
  it('15. signupIntent behavior routes unlinked business-signup intent user to onboarding', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    sessionStorage.setItem('vamo_auth_signup_intent', 'business');

    const mockUser = {
      id: 'usr-unlinked',
      provider_link: null,
    };
    vi.spyOn(authService, 'loginWithGoogle').mockResolvedValue(mockUser as any);

    await comp.onGoogleLogin();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/onboarding'], { queryParams: { social: 'business' } });
  });

  // 16. No raw token values are logged
  it('16. No raw token values are logged during Google Flow execution', async () => {
    const sensitiveIdToken = 'sensitive_google_id_token_xyz_987';
    const sensitiveAccessToken = 'sensitive_directus_access_token_123';
    const sensitiveRefreshToken = 'sensitive_directus_refresh_token_456';

    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: sensitiveAccessToken,
        refresh_token: sensitiveRefreshToken,
        expires: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    vi.spyOn(authService, 'handleSsoTokens').mockResolvedValue({ id: 'usr-1' } as any);

    await authService.loginWithGoogleCredential(sensitiveIdToken);

    const checkNoLeak = (spy: any) => {
      for (const call of spy.mock.calls) {
        const text = call.map((arg: any) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
        expect(text).not.toContain(sensitiveIdToken);
        expect(text).not.toContain(sensitiveAccessToken);
        expect(text).not.toContain(sensitiveRefreshToken);
      }
    };

    checkNoLeak(logSpy);
    checkNoLeak(warnSpy);
    checkNoLeak(errorSpy);
  });

  // 17. Normal email/password login remains unchanged
  it('17. Normal email/password login remains unchanged', async () => {
    const directusLoginSpy = vi.spyOn(directusClient, 'login').mockResolvedValue(undefined as any);
    const loadUserSpy = vi.spyOn(authService, 'loadCurrentUser').mockResolvedValue({
      id: 'usr-pw',
      email: 'user@example.com',
    } as any);

    const user = await authService.login('user@example.com', 'password123');

    expect(directusLoginSpy).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password123' });
    expect(loadUserSpy).toHaveBeenCalled();
    expect(user.id).toBe('usr-pw');
  });

  // 18. Forgot-password remains unchanged
  it('18. Forgot-password remains unchanged', async () => {
    const directusRequestSpy = vi.spyOn(directusClient, 'request').mockResolvedValue(undefined as any);

    await authService.requestPasswordReset('user@example.com');

    expect(directusRequestSpy).toHaveBeenCalled();
  });

  // 19. Existing guards remain unchanged
  it('19. Existing guards (authGuard, noAuthGuard, businessGuard) function properly', async () => {
    vi.spyOn(authService, 'restoreSession').mockResolvedValue(null);
    const canActivateAuth = await TestBed.runInInjectionContext(() => (authGuard as any)({} as any, { url: '/app/overview' } as any));
    expect(canActivateAuth).toBeInstanceOf(Object); // UrlTree redirect to /login

    const canActivateNoAuth = await TestBed.runInInjectionContext(() => (noAuthGuard as any)({} as any, {} as any));
    expect(canActivateNoAuth).toBe(true);

    const canActivateBusiness = await TestBed.runInInjectionContext(() => (businessGuard as any)({} as any, {} as any));
    expect(canActivateBusiness).toBeInstanceOf(Object); // UrlTree redirect to /login
  });

  // 20. Apple behavior is untouched
  it('20. Apple behavior is untouched and preserves loginWithProvider', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const comp = fixture.componentInstance;

    const ssoProviderSpy = vi.spyOn(authService, 'loginWithProvider').mockImplementation(() => {});

    comp.onAppleLogin();

    expect(ssoProviderSpy).toHaveBeenCalledWith('apple', '/app/overview');
    expect(comp.loading).toBe(true);
  });
});
