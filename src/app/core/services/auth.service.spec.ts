import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

describe('AuthService', () => {
  let service: AuthService;
  let routerSpy: any;

  beforeEach(() => {
    routerSpy = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(console, 'info').mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should clear session and navigate to /login on logout', async () => {
    await service.logout(true);

    expect(service.currentUser).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should maintain an explicit sessionFields allowlist without wildcards', () => {
    const fields = service.sessionFields as readonly string[];
    expect(fields.includes('*')).toBe(false);
    expect(fields.includes('provider_link.*')).toBe(false);
    expect(fields.includes('provider_link.logo.*')).toBe(false);
    expect(fields.includes('provider_link.images.directus_files_id.*')).toBe(false);
    expect(fields.includes('id')).toBe(true);
    expect(fields.includes('first_name')).toBe(true);
    expect(fields.includes('last_name')).toBe(true);
    expect(fields.includes('email')).toBe(true);
    expect(fields.includes('provider_link.id')).toBe(true);
    expect(fields.includes('provider_link.name')).toBe(true);
    expect(fields.includes('provider_link.subscription_tier')).toBe(true);
  });

  it('should store returnUrl in sessionStorage and redirect to Directus auth endpoint in loginWithProvider', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    try {
      service.loginWithProvider('google', '/app/listings');
    } catch {
      // jsdom may throw on window.location.href assignment
    }

    expect(setItemSpy).toHaveBeenCalledWith('vamo_auth_return_url', '/app/listings');
    setItemSpy.mockRestore();
  });

  it('should preserve business-signup intent in sessionStorage when provided in loginWithProvider and clear when not provided', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    try {
      service.loginWithProvider('google', '/onboarding?social=business', 'business');
    } catch {}

    expect(setItemSpy).toHaveBeenCalledWith('vamo_auth_return_url', '/onboarding?social=business');
    expect(setItemSpy).toHaveBeenCalledWith('vamo_auth_signup_intent', 'business');

    try {
      service.loginWithProvider('google', '/app/overview');
    } catch {}

    expect(removeItemSpy).toHaveBeenCalledWith('vamo_auth_signup_intent');

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it('should ingest tokens, update user, and store session in handleSsoTokens', async () => {
    const mockUser = {
      id: 'usr-sso',
      first_name: 'Alex',
      last_name: 'Rivera',
      email: 'alex@vamo.com',
      provider_link: { id: 'prov-sso', name: 'SSO Bar', subscription_tier: 'free' },
    };

    vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(mockUser as any);

    const user = await service.handleSsoTokens('mock_access_tok_123', 'mock_refresh_tok_456', 3600);

    expect(user.id).toBe('usr-sso');
    expect(service.currentUser?.email).toBe('alex@vamo.com');
  });

  it('should call registerUser with canonical verification_url on register when email is not taken', async () => {
    const directusClient = (await import('../directus/directus-client')).directusClient;
    const loginSpy = vi.spyOn(directusClient, 'login').mockRejectedValue(new Error('Invalid credentials'));
    const requestSpy = vi.spyOn(directusClient, 'request').mockResolvedValue(undefined as any);

    await service.register({
      first_name: 'Carlos',
      last_name: 'Pérez',
      email: 'carlos@vamo.com',
      password: 'password123',
    });

    expect(loginSpy).toHaveBeenCalledWith({ email: 'carlos@vamo.com', password: 'password123' });
    expect(requestSpy).toHaveBeenCalled();
  });

  it('should reject with RECORD_NOT_UNIQUE if login pre-check succeeds during register', async () => {
    const directusClient = (await import('../directus/directus-client')).directusClient;
    vi.spyOn(directusClient, 'login').mockResolvedValue(undefined as any);
    vi.spyOn(directusClient, 'logout').mockResolvedValue(undefined as any);

    await expect(
      service.register({
        first_name: 'Existing',
        last_name: 'User',
        email: 'taken@vamo.com',
        password: 'password123',
      })
    ).rejects.toMatchObject({
      errors: [{ extensions: { code: 'RECORD_NOT_UNIQUE' } }],
    });
  });

  describe('login()', () => {
    it('should authenticate user, update userSubject, and return user profile on valid credentials', async () => {
      const directusClient = (await import('../directus/directus-client')).directusClient;
      const mockUser = {
        id: 'usr-valid',
        email: 'valid@vamo.com',
        first_name: 'Maria',
        last_name: 'Santos',
        provider_link: { id: 'prov-1', name: 'Maria Cafe' },
      };

      vi.spyOn(directusClient, 'login').mockResolvedValue(undefined as any);
      vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(mockUser as any);

      const result = await service.login('valid@vamo.com', 'correctpass');

      expect(directusClient.login).toHaveBeenCalledWith({ email: 'valid@vamo.com', password: 'correctpass' });
      expect(result.id).toBe('usr-valid');
      expect(service.currentUser?.email).toBe('valid@vamo.com');
    });

    it('should reject promptly without hanging when directus credentials fail', async () => {
      const directusClient = (await import('../directus/directus-client')).directusClient;
      const credErr = {
        errors: [{ message: 'Invalid user credentials.', extensions: { code: 'INVALID_CREDENTIALS' } }],
      };
      vi.spyOn(directusClient, 'login').mockRejectedValue(credErr);

      await expect(service.login('valid@vamo.com', 'badpass')).rejects.toMatchObject(credErr);
    });

    it('should abort and reject with LOGIN_TIMEOUT when login hangs past timeoutMs', async () => {
      const directusClient = (await import('../directus/directus-client')).directusClient;
      // Mock login to return a promise that never resolves
      vi.spyOn(directusClient, 'login').mockReturnValue(new Promise(() => {}));

      // Call login with a short 50ms timeout for test speed
      const loginPromise = service.login('hung@vamo.com', 'pass', 50);

      await expect(loginPromise).rejects.toMatchObject({
        code: 'LOGIN_TIMEOUT',
      });
    });

    it('should ignore late login resolution after timeout and prevent auth state mutations', async () => {
      const directusClient = (await import('../directus/directus-client')).directusClient;
      let resolveLogin!: (val?: any) => void;
      const pendingLoginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      vi.spyOn(directusClient, 'login').mockReturnValue(pendingLoginPromise as any);
      const loadUserSpy = vi.spyOn(service, 'loadCurrentUser');
      const setTokenSpy = vi.spyOn(directusClient, 'setToken').mockResolvedValue(undefined as any);

      // 1. directusClient.login() remains pending past timeout
      // 2. service rejects LOGIN_TIMEOUT
      const loginPromise = service.login('hung@vamo.com', 'pass', 50);

      await expect(loginPromise).rejects.toMatchObject({
        code: 'LOGIN_TIMEOUT',
      });
      expect(service.currentUser).toBeNull();

      // 3. simulate the original login resolving afterward
      resolveLogin({ access_token: 'late_access', refresh_token: 'late_refresh' });
      await new Promise((res) => setTimeout(res, 20));

      // 4. verify loadCurrentUser is NOT called after timeout
      expect(loadUserSpy).not.toHaveBeenCalled();

      // 5. verify currentUser is NOT updated
      expect(service.currentUser).toBeNull();

      // 6. verify proactive refresh is NOT scheduled
      expect((service as any).proactiveRefreshTimer).toBeNull();

      // Verify that any late tokens stored by SDK are wiped
      expect(setTokenSpy).toHaveBeenCalledWith(null);
    });
  });
});
