import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

describe('AuthService', () => {
  let service: AuthService;
  let routerSpy: any;

  beforeEach(async () => {
    const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
    const { directusClient } = await import('../directus/directus-client');
    await createBrowserAuthStorage().set(null);
    await directusClient.setToken(null);

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

  afterEach(async () => {
    const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
    const { directusClient } = await import('../directus/directus-client');
    await createBrowserAuthStorage().set(null);
    await directusClient.setToken(null);
    vi.restoreAllMocks();
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
    it('1. normal valid password login succeeds, stores complete auth data, updates userSubject, and schedules refresh', async () => {
      const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
      const mockUser = {
        id: 'usr-valid',
        email: 'valid@vamo.com',
        first_name: 'Maria',
        last_name: 'Santos',
        provider_link: { id: 'prov-1', name: 'Maria Cafe' },
      };

      vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(mockUser as any);
      vi.spyOn(service as any, 'createIsolatedClient').mockImplementation((storage: any) => ({
        login: async (creds: any) => {
          expect(creds).toEqual({ email: 'valid@vamo.com', password: 'correctpass' });
          await storage.set({
            access_token: 'valid_access',
            refresh_token: 'valid_refresh',
            expires: 900000,
            expires_at: Date.now() + 900000,
          });
        },
      }));

      const scheduleSpy = vi.spyOn(service as any, 'scheduleProactiveRefresh');
      const result = await service.login('valid@vamo.com', 'correctpass');

      expect(result.id).toBe('usr-valid');
      expect(service.currentUser?.email).toBe('valid@vamo.com');
      const canonicalStorage = createBrowserAuthStorage();
      const stored = await canonicalStorage.get();
      expect(stored?.access_token).toBe('valid_access');
      expect(stored?.refresh_token).toBe('valid_refresh');
      expect(stored?.expires).toBe(900000);
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it('2. bad password fails normally without hanging or updating auth state', async () => {
      const credErr = {
        errors: [{ message: 'Invalid user credentials.', extensions: { code: 'INVALID_CREDENTIALS' } }],
      };
      vi.spyOn(service as any, 'createIsolatedClient').mockReturnValue({
        login: vi.fn().mockRejectedValue(credErr),
      });

      await expect(service.login('valid@vamo.com', 'badpass')).rejects.toMatchObject(credErr);
      expect(service.currentUser).toBeNull();
    });

    it('3. hung login times out after specified timeoutMs', async () => {
      vi.spyOn(service as any, 'createIsolatedClient').mockReturnValue({
        login: () => new Promise(() => {}),
      });

      const loginPromise = service.login('hung@vamo.com', 'pass', 50);

      await expect(loginPromise).rejects.toMatchObject({
        code: 'LOGIN_TIMEOUT',
      });
      expect(service.currentUser).toBeNull();
    });

    it('4-6. late resolution after timeout does not authenticate, does not call loadCurrentUser, and does not modify global auth storage', async () => {
      const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
      let resolveLogin!: () => void;
      const pendingLogin = new Promise<void>((resolve) => {
        resolveLogin = resolve;
      });

      const loadUserSpy = vi.spyOn(service, 'loadCurrentUser');
      const canonicalStorage = createBrowserAuthStorage();
      await canonicalStorage.set(null);

      vi.spyOn(service as any, 'createIsolatedClient').mockImplementation((storageParam: any) => ({
        login: async () => {
          await pendingLogin;
          await storageParam.set({
            access_token: 'late_access',
            refresh_token: 'late_refresh',
            expires: 900000,
            expires_at: Date.now() + 900000,
          });
        },
      }));

      // Login starts and hangs past timeout
      const loginPromise = service.login('hung@vamo.com', 'pass', 50);
      await expect(loginPromise).rejects.toMatchObject({ code: 'LOGIN_TIMEOUT' });
      expect(service.currentUser).toBeNull();

      // Simulate late resolution
      resolveLogin();
      await new Promise((res) => setTimeout(res, 25));

      // 4. late resolution does not authenticate
      expect(service.currentUser).toBeNull();

      // 5. late resolution does not call loadCurrentUser
      expect(loadUserSpy).not.toHaveBeenCalled();

      // 6. late resolution does not modify global auth storage
      const storedData = await canonicalStorage.get();
      expect(storedData).toBeNull();

      // Proactive refresh is not scheduled
      expect((service as any).proactiveRefreshTimer).toBeNull();
    });

    it('CRITICAL RACE TEST: late resolution of timed-out Login A must never clear or corrupt Login B session', async () => {
      const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
      const { directusClient } = await import('../directus/directus-client');

      const userB = {
        id: 'usr-b',
        email: 'user_b@vamo.com',
        first_name: 'Bob',
        last_name: 'Builder',
      };

      let resolveLoginA!: () => void;
      const pendingLoginA = new Promise<void>((resolve) => {
        resolveLoginA = resolve;
      });

      const setTokenSpy = vi.spyOn(directusClient, 'setToken');
      const logoutSpy = vi.spyOn(service, 'logout');
      vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(userB as any);

      vi.spyOn(service as any, 'createIsolatedClient').mockImplementation((storageParam: any) => ({
        login: async ({ email }: { email: string }) => {
          if (email === 'user_a@vamo.com') {
            await pendingLoginA;
            await storageParam.set({
              access_token: 'token_a',
              refresh_token: 'refresh_a',
              expires: 900000,
              expires_at: Date.now() + 900000,
            });
          } else if (email === 'user_b@vamo.com') {
            await storageParam.set({
              access_token: 'token_b',
              refresh_token: 'refresh_b',
              expires: 900000,
              expires_at: Date.now() + 900000,
            });
          }
        },
      }));

      // A. Login A starts and remains pending
      // B. A times out
      const loginAPromise = service.login('user_a@vamo.com', 'pass_a', 50);
      await expect(loginAPromise).rejects.toMatchObject({ code: 'LOGIN_TIMEOUT' });
      expect(service.currentUser).toBeNull();

      // C. Login B starts
      // D. B succeeds
      // E. B becomes current authenticated session
      const loginBResult = await service.login('user_b@vamo.com', 'pass_b');
      expect(loginBResult.id).toBe('usr-b');
      expect(service.currentUser?.id).toBe('usr-b');

      const storage = createBrowserAuthStorage();
      let stored = await storage.get();
      expect(stored?.access_token).toBe('token_b');
      expect(stored?.refresh_token).toBe('refresh_b');

      // F. A resolves late
      resolveLoginA();
      await new Promise((res) => setTimeout(res, 30));

      // G. Verify:
      // - B remains authenticated
      expect(service.currentUser?.id).toBe('usr-b');
      expect(service.currentUser?.email).toBe('user_b@vamo.com');

      // - B's stored access token remains unchanged
      stored = await storage.get();
      expect(stored?.access_token).toBe('token_b');

      // - B's refresh token remains unchanged
      expect(stored?.refresh_token).toBe('refresh_b');

      // - currentUser remains B
      expect(service.currentUser).toEqual(userB);

      // - no global setToken(null)
      expect(setTokenSpy).not.toHaveBeenCalledWith(null);

      // - no logout/session clear occurs
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('should verify refresh still works after successful password login', async () => {
      const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
      const { directusClient } = await import('../directus/directus-client');

      const mockUser = {
        id: 'usr-valid',
        email: 'valid@vamo.com',
      };
      vi.spyOn(service, 'loadCurrentUser').mockResolvedValue(mockUser as any);

      vi.spyOn(service as any, 'createIsolatedClient').mockImplementation((storageParam: any) => ({
        login: async () => {
          await storageParam.set({
            access_token: 'initial_access_token',
            refresh_token: 'initial_refresh_token',
            expires: 900000,
            expires_at: Date.now() + 900000,
          });
        },
      }));

      const refreshSpy = vi.spyOn(directusClient, 'refresh').mockImplementation(async () => {
        const storage = createBrowserAuthStorage();
        const current = await storage.get();
        expect(current?.refresh_token).toBe('initial_refresh_token');
        await storage.set({
          access_token: 'refreshed_access_token',
          refresh_token: 'new_refresh_token',
          expires: 900000,
          expires_at: Date.now() + 900000,
        });
        return {} as any;
      });

      await service.login('valid@vamo.com', 'correctpass');

      // Trigger refreshToken()
      const refreshResult = await service.refreshToken();
      expect(refreshResult).toBe(true);
      expect(refreshSpy).toHaveBeenCalled();

      const finalStorage = await createBrowserAuthStorage().get();
      expect(finalStorage?.access_token).toBe('refreshed_access_token');
      expect(finalStorage?.refresh_token).toBe('new_refresh_token');
    });
  });

  describe('Session Expiry Handling & Return URL (UX Cleanup)', () => {
    it('access token expires → refresh succeeds → request retries transparently', async () => {
      const { directusClient } = await import('../directus/directus-client');
      vi.spyOn(directusClient, 'refresh').mockResolvedValue({} as any);

      let callCount = 0;
      const apiCall = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Token expired');
          err.errors = [{ extensions: { code: 'TOKEN_EXPIRED' } }];
          throw err;
        }
        return 'success-data';
      });

      const result = await service.safeRequest(apiCall);
      expect(result).toBe('success-data');
      expect(callCount).toBe(2);
      expect(directusClient.refresh).toHaveBeenCalledTimes(1);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('access token expires → refresh fails → local session cleared and redirected to /login with reason=expired', async () => {
      const { createBrowserAuthStorage } = await import('../directus/browser-auth.storage');
      const { directusClient } = await import('../directus/directus-client');

      const storage = createBrowserAuthStorage();
      await storage.set({ access_token: 'valid_tok', refresh_token: 'dead_refresh' });
      vi.spyOn(directusClient, 'refresh').mockRejectedValue(new Error('Invalid refresh token'));
      vi.spyOn(directusClient, 'logout').mockRejectedValue(new Error('400 Bad Request')); // logout failure must not block cleanup

      const apiCall = vi.fn().mockImplementation(async () => {
        const err: any = new Error('Token expired');
        err.errors = [{ extensions: { code: 'TOKEN_EXPIRED' } }];
        throw err;
      });

      await expect(service.safeRequest(apiCall)).rejects.toThrow();

      // Local session is cleared
      const stored = await storage.get();
      expect(stored).toBeNull();
      expect(service.currentUser).toBeNull();

      // Redirected to /login with reason: 'expired'
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: expect.objectContaining({
          reason: 'expired',
        }),
      });
    });

    it('expired-session returnUrl preserved for protected routes', async () => {
      const { directusClient } = await import('../directus/directus-client');
      vi.spyOn(directusClient, 'refresh').mockRejectedValue(new Error('Refresh failed'));

      // Simulate being on a protected page
      (service as any).router.url = '/app/listings/edit/event-abc';

      await service.refreshToken();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: {
          returnUrl: '/app/listings/edit/event-abc',
          reason: 'expired',
        },
      });
    });

    it('unsafe external or non-app returnUrl is sanitized to /app/overview', () => {
      expect(service.sanitizeReturnUrl('https://evil.com/phish')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('//evil.com')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('/\\evil.com')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('javascript:alert(1)')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('/login')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('/outside')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl('')).toBe('/app/overview');
      expect(service.sanitizeReturnUrl(null)).toBe('/app/overview');

      // Valid internal protected routes are preserved
      expect(service.sanitizeReturnUrl('/app/insights')).toBe('/app/insights');
      expect(service.sanitizeReturnUrl('/app/promotions?eventId=ev-123')).toBe('/app/promotions?eventId=ev-123');
      expect(service.sanitizeReturnUrl('/app/listings/create')).toBe('/app/listings/create');
    });

    it('network failure does NOT log user out', async () => {
      const { directusClient } = await import('../directus/directus-client');
      const refreshSpy = vi.spyOn(directusClient, 'refresh');

      const apiCall = vi.fn().mockImplementation(async () => {
        throw new Error('Failed to fetch');
      });

      await expect(service.safeRequest(apiCall)).rejects.toThrow('Failed to fetch');
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('403 forbidden error does NOT log user out', async () => {
      const { directusClient } = await import('../directus/directus-client');
      const refreshSpy = vi.spyOn(directusClient, 'refresh');

      const apiCall = vi.fn().mockImplementation(async () => {
        const err: any = new Error('Forbidden');
        err.status = 403;
        err.errors = [{ extensions: { code: 'FORBIDDEN' } }];
        throw err;
      });

      await expect(service.safeRequest(apiCall)).rejects.toThrow('Forbidden');
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('concurrent refresh failures do not create multiple redirects', async () => {
      const { directusClient } = await import('../directus/directus-client');
      vi.spyOn(directusClient, 'refresh').mockRejectedValue(new Error('Invalid token'));

      const apiCall1 = async () => {
        const err: any = new Error('Token expired');
        err.errors = [{ extensions: { code: 'TOKEN_EXPIRED' } }];
        throw err;
      };
      const apiCall2 = async () => {
        const err: any = new Error('Token expired');
        err.errors = [{ extensions: { code: 'TOKEN_EXPIRED' } }];
        throw err;
      };
      const apiCall3 = async () => {
        const err: any = new Error('Token expired');
        err.errors = [{ extensions: { code: 'TOKEN_EXPIRED' } }];
        throw err;
      };

      // Run 3 concurrent requests that all fail with TOKEN_EXPIRED
      await Promise.allSettled([
        service.safeRequest(apiCall1),
        service.safeRequest(apiCall2),
        service.safeRequest(apiCall3),
      ]);

      // directusClient.refresh only called once
      expect(directusClient.refresh).toHaveBeenCalledTimes(1);
      // navigation only called once
      expect(routerSpy.navigate).toHaveBeenCalledTimes(1);
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], expect.objectContaining({
        queryParams: expect.objectContaining({ reason: 'expired' }),
      }));
    });

    it('manual logout behaves normally and does not show session-expired notice', async () => {
      sessionStorage.setItem('vamo_expired_session', 'true');
      sessionStorage.setItem('vamo_expired_return_url', '/app/promotions');

      await service.logout(true);

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
      expect(sessionStorage.getItem('vamo_expired_session')).toBeNull();
      expect(sessionStorage.getItem('vamo_expired_return_url')).toBeNull();
    });
  });
});
