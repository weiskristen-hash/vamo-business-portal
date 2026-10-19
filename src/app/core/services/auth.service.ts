import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthenticationStorage, createItem, passwordRequest, readMe, registerUser, updateMe } from '@directus/sdk';
import { directusClient, createIsolatedDirectusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { createBrowserAuthStorage, createMemoryAuthStorage, BUSINESS_AUTH_STORAGE_KEY } from '../directus/browser-auth.storage';
import { VamoUser } from '../models/user.model';
import { environment } from '../../../environments/environment';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { clearSavedPromoCode } from '../utils/promo-code.util';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

async function runWithCrossTabLock<T>(lockName: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && (navigator as any).locks?.request) {
    return (navigator as any).locks.request(lockName, fn);
  }
  return fn();
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private router = inject(Router);
  private googleAuthService = inject(GoogleAuthService);
  private appleAuthService = inject(AppleAuthService);

  // undefined = checking session, null = not logged in, VamoUser = logged in
  private userSubject = new BehaviorSubject<VamoUser | null | undefined>(undefined);
  public user$: Observable<VamoUser | null | undefined> = this.userSubject.asObservable();

  private refreshPromise: Promise<boolean> | null = null;
  private proactiveRefreshTimer: any = null;
  private sessionWarningTimer: any = null;
  private restoreSessionNonce = 0;
  private loginNonce = 0;
  private refreshScheduleNonce = 0;

  private sessionExpiringSubject = new BehaviorSubject<boolean>(false);
  public sessionExpiring$: Observable<boolean> = this.sessionExpiringSubject.asObservable();

  private readonly resumeSession = () => { void this.restoreSession(); };
  private readonly resumeVisibleSession = () => {
    if (document.visibilityState === 'visible') this.resumeSession();
  };
  private readonly handleStorageChange = (event: StorageEvent) => {
    if (event.key === BUSINESS_AUTH_STORAGE_KEY) {
      if (event.newValue) {
        // Sibling tab refreshed tokens
        this.scheduleProactiveRefresh();
        this.sessionExpiringSubject.next(false);
      } else if (this.userSubject.value) {
        // Sibling tab logged out
        this.userSubject.next(null);
      }
    }
  };

  constructor() {
    this.restoreSession();
    this.setupNetworkListener();
  }

  get currentUser(): VamoUser | null {
    const val = this.userSubject.value;
    return val ?? null;
  }

  get isInitialCheckDone(): boolean {
    return this.userSubject.value !== undefined;
  }

  get isSessionExpiring(): boolean {
    return this.sessionExpiringSubject.value;
  }

  /**
   * Extends the current session in response to the session expiry warning.
   */
  async staySignedIn(): Promise<boolean> {
    this.sessionExpiringSubject.next(false);
    return await this.refreshToken();
  }

  /**
   * Returns a promise that resolves once the initial session restore check has completed.
   */
  async waitForInitialAuth(): Promise<VamoUser | null> {
    if (this.userSubject.value !== undefined) {
      return this.userSubject.value;
    }
    const user = await firstValueFrom(
      this.user$.pipe(filter((u): u is VamoUser | null => u !== undefined))
    );
    return user;
  }

  // ======================================================
  // 🔹 SAFE REQUEST WRAPPER (Auto-retry on TOKEN_EXPIRED)
  // ======================================================

  async safeRequest<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('OFFLINE');
    }

    try {
      await this.proactiveRefreshCheck();
      return await fn();
    } catch (err: any) {
      const code = err?.errors?.[0]?.extensions?.code || err?.code;
      const status = err?.status || err?.response?.status;
      const isExpired = code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN' || status === 401;

      if (isExpired) {
        const refreshed = await this.refreshToken();
        if (!refreshed) throw err;
        return await fn(); // retry once after successful refresh
      }

      throw err;
    }
  }

  // ======================================================
  // 🔹 TOKEN REFRESH (Locked against concurrency)
  // ======================================================

  async refreshToken(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          return await this.executeLockedRefresh();
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
  }

  private async executeLockedRefresh(): Promise<boolean> {
    return runWithCrossTabLock('vamo_auth_refresh', async () => {
      // 1. Double-checked storage check: another tab may have refreshed while waiting for lock
      const currentSession = await createBrowserAuthStorage().get();
      const token = currentSession?.access_token;
      if (token) {
        const exp = this.decodeJwtExpiry(token);
        const now = Date.now();
        // If token in storage is valid for more than 2 minutes, another tab refreshed it
        if (exp !== null && exp - now > 2 * 60 * 1000) {
          this.scheduleProactiveRefresh();
          this.sessionExpiringSubject.next(false);
          return true;
        }
      }

      // 2. Perform refresh via Directus
      try {
        await directusClient.refresh();
        this.scheduleProactiveRefresh();
        this.sessionExpiringSubject.next(false);
        return true;
      } catch (err: any) {
        // 3. Before treating as session expiry, check if another tab updated storage during inflight request
        const freshSession = await createBrowserAuthStorage().get();
        if (freshSession?.access_token && freshSession.access_token !== token) {
          const freshExp = this.decodeJwtExpiry(freshSession.access_token);
          if (freshExp !== null && freshExp > Date.now() + 60 * 1000) {
            this.scheduleProactiveRefresh();
            this.sessionExpiringSubject.next(false);
            return true;
          }
        }

        if (this.isSessionRejection(err)) {
          await this.handleSessionExpired();
          return false;
        }
        // Losing connectivity or an API outage does not revoke a valid session.
        this.scheduleRefreshRetry();
        throw err;
      }
    });
  }

  private isSessionRejection(err: any): boolean {
    const code = err?.errors?.[0]?.extensions?.code ?? err?.code;
    const status = err?.status ?? err?.response?.status;
    return status === 401 || ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'INVALID_CREDENTIALS'].includes(code);
  }

  private clearRefreshTimer(): void {
    this.refreshScheduleNonce++;
    if (this.proactiveRefreshTimer) clearTimeout(this.proactiveRefreshTimer);
    this.proactiveRefreshTimer = null;
    this.clearWarningTimer();
  }

  private clearWarningTimer(): void {
    if (this.sessionWarningTimer) {
      clearTimeout(this.sessionWarningTimer);
      this.sessionWarningTimer = null;
    }
  }

  private scheduleSessionWarning(delayMs: number): void {
    this.clearWarningTimer();
    this.sessionWarningTimer = setTimeout(() => {
      if (this.userSubject.value) {
        this.sessionExpiringSubject.next(true);
      }
    }, Math.max(1000, delayMs));
  }

  private scheduleRefreshRetry(): void {
    this.clearRefreshTimer();
    this.proactiveRefreshTimer = setTimeout(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.scheduleRefreshRetry();
        return;
      }
      void this.refreshToken().catch(() => { /* next retry is scheduled by refreshToken */ });
    }, 30_000);
  }

  // ======================================================
  // 🔹 SESSION EXPIRY & RETURN URL HANDLING
  // ======================================================

  private isRedirectingForExpiry = false;

  sanitizeReturnUrl(url: string | null | undefined): string {
    if (!url || typeof url !== 'string') return '/app/overview';
    const trimmed = url.trim();
    // Prevent open redirects & malformed paths
    if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
      return '/app/overview';
    }
    if (/[\r\n\t\\]/.test(trimmed)) {
      return '/app/overview';
    }
    // Must be under the portal (specifically /app)
    if (!trimmed.startsWith('/app')) {
      return '/app/overview';
    }
    return trimmed;
  }

  private getCurrentRouteUrl(): string {
    try {
      if (this.router.url && this.router.url !== '/' && !this.router.url.startsWith('/login')) {
        return this.router.url;
      }
      if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname + window.location.search;
        if (path && path !== '/' && !path.startsWith('/login')) {
          return path;
        }
      }
    } catch {}
    return '/app/overview';
  }

  async handleSessionExpired(): Promise<void> {
    this.clearRefreshTimer();
    this.restoreSessionNonce++;

    try {
      await directusClient.setToken(null);
    } catch (e) {
      console.warn('[AuthService] Error clearing directus client token:', e);
    }

    try {
      const storage = createBrowserAuthStorage();
      await storage.set(null);
    } catch (e) {
      console.warn('[AuthService] Error clearing browser auth storage:', e);
    }

    try {
      await directusClient.logout();
    } catch {
      // 400 or invalid token is expected when session is already dead
    }

    this.userSubject.next(null);

    if (this.isRedirectingForExpiry) {
      return;
    }
    this.isRedirectingForExpiry = true;

    try {
      const currentUrl = this.getCurrentRouteUrl();
      const returnUrl = this.sanitizeReturnUrl(currentUrl);

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.setItem('vamo_expired_session', 'true');
          window.sessionStorage.setItem('vamo_expired_return_url', returnUrl);
        } catch {
          // ignore storage restrictions
        }
      }

      await this.router.navigate(['/login'], {
        queryParams: {
          returnUrl,
          reason: 'expired',
        },
      });
    } finally {
      setTimeout(() => {
        this.isRedirectingForExpiry = false;
      }, 1000);
    }
  }

  // ======================================================
  // 🔹 PROACTIVE REFRESH (Refresh token before it expires)
  // ======================================================

  private async proactiveRefreshCheck(): Promise<void> {
    // SDK getToken() can itself refresh near expiry, even with autoRefresh:false.
    // Inspect storage first so all refreshes use our error handling and lock.
    const session = await createBrowserAuthStorage().get();
    const token = session?.access_token;
    if (!token) return;

    const expiresAt = this.decodeJwtExpiry(token);
    if (expiresAt === null) return;

    const now = Date.now();
    const buffer = 2 * 60 * 1000; // 2 minutes buffer

    if (expiresAt - now < buffer) {
      if (!await this.refreshToken()) throw new Error('SESSION_EXPIRED');
    }
  }

  private scheduleProactiveRefresh(): void {
    this.clearRefreshTimer();
    const nonce = this.refreshScheduleNonce;

    Promise.resolve(createBrowserAuthStorage().get()).then((session) => {
      if (nonce !== this.refreshScheduleNonce) return;
      const token = session?.access_token;
      if (!token) return;

      const expiresAt = this.decodeJwtExpiry(token);
      if (expiresAt === null) return;

      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      const timeout = timeUntilExpiry - 2 * 60 * 1000;

      // Predictable expiry warning 2 minutes before expiration
      this.scheduleSessionWarning(timeUntilExpiry - 2 * 60 * 1000);

      this.proactiveRefreshTimer = setTimeout(() => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.scheduleRefreshRetry();
          return;
        }
        void this.refreshToken().catch(() => { /* preserve session and retry */ });
      }, Math.max(1000, timeout));
    });
  }

  private decodeJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    await this.proactiveRefreshCheck();
    return (await createBrowserAuthStorage().get())?.access_token ?? null;
  }

  // ======================================================
  // 🔹 SESSION RESTORATION
  // ======================================================

  async restoreSession(): Promise<VamoUser | null> {
    const nonce = ++this.restoreSessionNonce;
    try {
      const storage = createBrowserAuthStorage();
      const session = await storage.get();
      if (!session || (!session.access_token && !session.refresh_token)) {
        this.userSubject.next(null);
        return null;
      }

      const user = await this.safeRequest(() => this.loadCurrentUser());
      if (nonce !== this.restoreSessionNonce) return null;

      this.userSubject.next(user);
      this.scheduleProactiveRefresh();
      return user;
    } catch (err: any) {
      console.info('[AuthService] No active or valid session found during restore:', err?.message || err);
      if (nonce !== this.restoreSessionNonce) return null;

      if (this.isSessionRejection(err)) this.userSubject.next(null);
      else if (this.userSubject.value === undefined) this.userSubject.next(null);
      // Keep an already loaded user and stored tokens on transient resume errors.
      return this.currentUser;
    }
  }

  // ======================================================
  // 🔹 CURRENT USER LOADER
  // ======================================================

  readonly sessionFields = [
    'id',
    'first_name',
    'last_name',
    'email',
    'role.id',
    'role.name',
    'provider_link.id',
    'provider_link.name',
    'provider_link.subscription_tier',
    'provider_link.logo.id',
    'provider_link.status',
  ] as const;

  async loadCurrentUser(): Promise<VamoUser> {
    return directusClient.request<VamoUser>(
      readMe({
        fields: this.sessionFields as any,
      })
    );
  }

  // ======================================================
  // 🔹 LOGIN & SSO
  // ======================================================

  async register(payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }): Promise<void> {
    const tempStorage = createMemoryAuthStorage();
    const tempClient = this.createIsolatedClient(tempStorage);

    // Canonical VAMO pre-check: Directus returns 204 even for duplicate emails without throwing.
    // Run the pre-check on an isolated in-memory client so an existing browser session is never modified.
    try {
      await tempClient.login({ email: payload.email, password: payload.password });
      try {
        await tempClient.logout();
      } catch {
        /* ignore */
      }
      const takenErr: any = new Error('Email already taken');
      takenErr.errors = [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Email already taken' }];
      throw takenErr;
    } catch (preLoginErr: any) {
      if (preLoginErr?.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') throw preLoginErr;
      // Login failed -> email is not registered with this password, proceed to registerUser
    }

    await tempClient.request(
      registerUser(payload.email, payload.password, {
        verification_url: 'https://vamo-app.com/verify.html',
        first_name: payload.first_name,
        last_name: payload.last_name,
      })
    );
  }

  async createProviderAndLink(data: Record<string, any>): Promise<VamoUser> {
    const payload = { ...data };
    delete payload['translations'];
    delete payload['translation_status'];

    // Creating the provider triggers the "Provider → Link to Creator" Directus Flow,
    // which automatically sets provider_link on the current user server-side.
    const createdProvider = await this.safeRequest(() =>
      directusClient.request(createItem('providers', payload as any))
    );
    let user = await this.loadCurrentUser();
    if (!user?.provider_link?.id && (createdProvider as any)?.id) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((res) => setTimeout(res, 350));
        user = await this.loadCurrentUser();
        if (user?.provider_link?.id) break;
      }
    }
    this.userSubject.next(user);
    return user;
  }

  protected createIsolatedClient(storage: AuthenticationStorage) {
    return createIsolatedDirectusClient(storage);
  }

  async login(email: string, password: string, timeoutMs: number = 12000): Promise<VamoUser> {
    const nonce = ++this.loginNonce;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Invalidate current login nonce so any late response from isolated login is ignored
        if (nonce === this.loginNonce) {
          this.loginNonce++;
        }
        const timeoutErr = new Error('Authentication request timed out. Please check your connection and try again.');
        (timeoutErr as any).code = 'LOGIN_TIMEOUT';
        reject(timeoutErr);
      }, timeoutMs);
    });

    try {
      const tempStorage = createMemoryAuthStorage();
      const tempClient = this.createIsolatedClient(tempStorage);

      const loginTask = (async () => {
        await tempClient.login({ email, password });

        // Generation guard: verify request was not superseded or timed out
        if (nonce !== this.loginNonce) {
          return null;
        }

        const authData = await tempStorage.get();
        if (!authData || !authData.access_token) {
          throw new Error('Authentication data missing from isolated login attempt');
        }

        if (nonce !== this.loginNonce) {
          return null;
        }

        const canonicalStorage = createBrowserAuthStorage();
        await canonicalStorage.set(authData);

        if (nonce !== this.loginNonce) {
          return null;
        }

        const user = await this.loadCurrentUser();
        if (nonce !== this.loginNonce) {
          return null;
        }

        this.userSubject.next(user);
        this.scheduleProactiveRefresh();
        return user;
      })();

      const result = await Promise.race([loginTask, timeoutPromise]);
      if (!result) {
        throw new Error('Authentication aborted');
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Hand off to Directus hosted OAuth flow (google only; Apple uses AppleID.auth popup + Directus flow).
   * Directus redirects back to /auth/callback with access_token, refresh_token, expires.
   */
  loginWithProvider(
    provider: 'google',
    returnUrl: string = '/app/overview',
    signupIntent?: 'business' | 'browse'
  ): void {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem('vamo_auth_return_url', returnUrl);
      if (signupIntent) {
        window.sessionStorage.setItem('vamo_auth_signup_intent', signupIntent);
      } else {
        window.sessionStorage.removeItem('vamo_auth_signup_intent');
      }
    } catch {
      // Ignore storage restrictions
    }

    const callbackUrl = `${window.location.origin}/auth/callback`;
    const authUrl = `${runtimeConfig.directusUrl}/auth/login/${provider}?redirect=${encodeURIComponent(callbackUrl)}`;
    window.location.href = authUrl;
  }

  /**
   * Exchanges a Google ID token with the VAMO Google Sign-In Directus Flow.
   * Stores the returned Directus session tokens and loads the current user.
   */
  async loginWithGoogleCredential(idToken: string): Promise<VamoUser> {
    if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
      throw new Error('GOOGLE_TOKEN_MISSING');
    }

    const flowId = runtimeConfig.googleSignInFlow;
    if (!flowId) {
      throw new Error('GOOGLE_FLOW_NOT_CONFIGURED');
    }

    const flowUrl = `${runtimeConfig.directusUrl}/flows/trigger/${flowId}`;

    let response: Response;
    try {
      response = await fetch(flowUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id_token: idToken.trim() }),
      });
    } catch {
      throw new Error('NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new Error(`GOOGLE_FLOW_FAILED_${response.status}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('MALFORMED_FLOW_RESPONSE');
    }

    if (!data || typeof data !== 'object' || !data.access_token || typeof data.access_token !== 'string') {
      throw new Error('MALFORMED_FLOW_RESPONSE');
    }

    const user = await this.handleSsoTokens(
      data.access_token,
      data.refresh_token ?? null,
      data.expires ? Number(data.expires) : null
    );

    if (!user) {
      throw new Error('USER_LOAD_FAILED');
    }

    return user;
  }

  /**
   * Initiates Google Sign-In, retrieves Google ID token, and authenticates via Directus Flow.
   */
  async loginWithGoogle(): Promise<VamoUser> {
    const idToken = await this.googleAuthService.promptForIdToken();
    return await this.loginWithGoogleCredential(idToken);
  }

  /**
   * Exchanges an Apple identity token with the VAMO Apple Sign-In Directus Flow.
   * Verifies the token's structure, claims, and RS256 signature against Apple's JWKS
   * before sending it to the Directus flow, then stores the returned session tokens.
   */
  async loginWithAppleCredential(
    identityToken: string,
    userName?: { firstName?: string; lastName?: string } | null,
    alreadyVerified = false
  ): Promise<VamoUser> {
    if (!identityToken || typeof identityToken !== 'string' || !identityToken.trim()) {
      throw new Error('APPLE_TOKEN_MISSING');
    }

    const flowId = runtimeConfig.appleSignInFlow;
    if (!flowId) {
      throw new Error('APPLE_FLOW_NOT_CONFIGURED');
    }

    const trimmedToken = identityToken.trim();
    if (!alreadyVerified) {
      await this.appleAuthService.verifyIdentityToken(trimmedToken);
    }

    const flowUrl = `${runtimeConfig.directusUrl}/flows/trigger/${flowId}`;

    let response: Response;
    try {
      response = await fetch(flowUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identity_token: trimmedToken,
          user_name: {
            firstName: userName?.firstName?.trim() || '',
            lastName: userName?.lastName?.trim() || '',
          },
        }),
      });
    } catch {
      throw new Error('NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new Error(`APPLE_FLOW_FAILED_${response.status}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('MALFORMED_FLOW_RESPONSE');
    }

    if (!data || typeof data !== 'object' || !data.access_token || typeof data.access_token !== 'string') {
      throw new Error('MALFORMED_FLOW_RESPONSE');
    }

    const user = await this.handleSsoTokens(
      data.access_token,
      data.refresh_token ?? null,
      data.expires ? Number(data.expires) : null
    );

    if (!user) {
      throw new Error('USER_LOAD_FAILED');
    }

    return user;
  }

  /**
   * Initiates Apple Sign-In via Apple JS SDK popup, retrieves and verifies Apple identity_token,
   * and authenticates via the VAMO Directus Apple Sign-In Flow.
   */
  async loginWithApple(): Promise<VamoUser> {
    const result = await this.appleAuthService.signIn();
    return await this.loginWithAppleCredential(result.identityToken, result.userName, true);
  }

  /**
   * Ingest session tokens received from OAuth redirect callback.
   */
  async handleSsoTokens(accessToken: string, refreshToken?: string | null, expires?: number | null): Promise<VamoUser> {
    const storage = createBrowserAuthStorage();
    await storage.set({
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      expires: expires ?? null,
      expires_at: expires ? Date.now() + expires : null,
    });

    // The SDK reads this storage on every request. setToken() would overwrite
    // it with access_token only and erase the Google/SSO refresh token.

    const user = await this.loadCurrentUser();
    this.userSubject.next(user);
    this.scheduleProactiveRefresh();

    return user;
  }

  // ======================================================
  // 🔹 LOGOUT
  // ======================================================

  async logout(redirect: boolean = true): Promise<void> {
    this.clearRefreshTimer();
    this.restoreSessionNonce++;
    clearSavedPromoCode();

    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem('vamo_expired_session');
        window.sessionStorage.removeItem('vamo_expired_return_url');
      } catch {}
    }

    try {
      const storage = createBrowserAuthStorage();
      await storage.set(null);
    } catch (e) {
      console.warn('[AuthService] Error clearing browser auth storage:', e);
    }

    try {
      await directusClient.setToken(null);
    } catch (e) {
      console.warn('[AuthService] Error clearing directus client token:', e);
    }

    try {
      await directusClient.logout();
    } catch (err) {
      console.warn('[AuthService] Directus logout error:', err);
    }

    this.userSubject.next(null);

    if (redirect) {
      await this.router.navigate(['/login']);
    }
  }

  // ======================================================
  // 🔹 FORGOT PASSWORD
  // ======================================================

  async requestPasswordReset(email: string, resetUrl: string = environment.defaultResetRedirect): Promise<void> {
    await directusClient.request(passwordRequest(email, resetUrl));
  }

  // ======================================================
  // 🔹 USER PROFILE & ACCOUNT MANAGEMENT
  // ======================================================

  /**
   * Updates authenticated user's first name, last name, and/or email using canonical updateMe.
   * Reloads current user and emits through userSubject to update app reactively.
   */
  async updateProfile(data: { first_name: string; last_name: string; email: string }): Promise<VamoUser> {
    await this.safeRequest(() =>
      directusClient.request(
        updateMe({
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          email: data.email.trim().toLowerCase(),
        })
      )
    );

    const updatedUser = await this.loadCurrentUser();
    this.userSubject.next(updatedUser);
    return updatedUser;
  }

  /**
   * Deletes authenticated user account using canonical DELETE_ACCOUNT_FLOW Directus Flow.
   * Strictly targets current authenticated user session via Bearer token (no user ID passed from client).
   * Clears auth session on success.
   */
  async deleteAccount(): Promise<void> {
    const token = await directusClient.getToken();
    if (!token) {
      const err = new Error('NOT_AUTHENTICATED');
      (err as any).status = 401;
      throw err;
    }

    const flowId = runtimeConfig.deleteAccountFlow;
    if (!flowId) {
      const err = new Error('DELETE_ACCOUNT_FLOW_NOT_CONFIGURED');
      (err as any).status = 503;
      throw err;
    }

    const url = `${runtimeConfig.directusUrl}/flows/trigger/${flowId}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    } catch (fetchErr: any) {
      const err = new Error(fetchErr?.message || 'NETWORK_ERROR');
      err.name = fetchErr?.name || 'TypeError';
      (err as any).isNetworkError = true;
      throw err;
    }

    if (response.status === 401 || response.status === 403) {
      const err = new Error('SESSION_EXPIRED');
      (err as any).status = response.status;
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const err = new Error(`Account deletion failed (${response.status}): ${body}`);
      (err as any).status = response.status;
      throw err;
    }

    await this.logout(false);
  }

  // ======================================================
  // 🔹 NETWORK LISTENER
  // ======================================================

  private setupNetworkListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.resumeSession);
      window.addEventListener('focus', this.resumeSession);
      window.addEventListener('storage', this.handleStorageChange);
      document.addEventListener('visibilitychange', this.resumeVisibleSession);
    }
  }

  ngOnDestroy(): void {
    this.clearRefreshTimer();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.resumeSession);
      window.removeEventListener('focus', this.resumeSession);
      window.removeEventListener('storage', this.handleStorageChange);
      document.removeEventListener('visibilitychange', this.resumeVisibleSession);
    }
  }
}
