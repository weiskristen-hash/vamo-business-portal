import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthenticationStorage, createItem, passwordRequest, readMe, registerUser, updateMe } from '@directus/sdk';
import { directusClient, createIsolatedDirectusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { createBrowserAuthStorage, createMemoryAuthStorage } from '../directus/browser-auth.storage';
import { VamoUser } from '../models/user.model';
import { environment } from '../../../environments/environment';
import { GoogleAuthService } from './google-auth.service';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  private googleAuthService = inject(GoogleAuthService);

  // undefined = checking session, null = not logged in, VamoUser = logged in
  private userSubject = new BehaviorSubject<VamoUser | null | undefined>(undefined);
  public user$: Observable<VamoUser | null | undefined> = this.userSubject.asObservable();

  private refreshPromise: Promise<boolean> | null = null;
  private proactiveRefreshTimer: any = null;
  private restoreSessionNonce = 0;
  private loginNonce = 0;

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
          await directusClient.refresh();
          this.scheduleProactiveRefresh();
          return true;
        } catch (err) {
          console.warn('[AuthService] Token refresh failed, handling session expiry:', err);
          await this.handleSessionExpired();
          return false;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
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
    if (this.proactiveRefreshTimer) {
      clearTimeout(this.proactiveRefreshTimer);
      this.proactiveRefreshTimer = null;
    }

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
    const token = await directusClient.getToken();
    if (!token) return;

    const expiresAt = this.decodeJwtExpiry(token);
    if (expiresAt === null) return;

    const now = Date.now();
    const buffer = 2 * 60 * 1000; // 2 minutes buffer

    if (expiresAt - now < buffer) {
      await this.refreshToken();
    }
  }

  private scheduleProactiveRefresh(): void {
    if (this.proactiveRefreshTimer) {
      clearTimeout(this.proactiveRefreshTimer);
      this.proactiveRefreshTimer = null;
    }

    directusClient.getToken().then((token) => {
      if (!token) return;

      const expiresAt = this.decodeJwtExpiry(token);
      if (expiresAt === null) return;

      const now = Date.now();
      const timeout = expiresAt - now - 2 * 60 * 1000;

      if (timeout > 0) {
        this.proactiveRefreshTimer = setTimeout(() => {
          this.refreshToken();
        }, timeout);
      }
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
    return directusClient.getToken();
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

      this.userSubject.next(null);
      return null;
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
    // Canonical VAMO pre-check: Directus returns 204 even for duplicate emails without throwing.
    // If login succeeds with these credentials, the email is already registered.
    try {
      await directusClient.login({ email: payload.email, password: payload.password });
      try { await directusClient.logout(); } catch { /* ignore */ }
      const takenErr: any = new Error('Email already taken');
      takenErr.errors = [{ extensions: { code: 'RECORD_NOT_UNIQUE' }, message: 'Email already taken' }];
      throw takenErr;
    } catch (preLoginErr: any) {
      if (preLoginErr?.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') throw preLoginErr;
      // Login failed -> email is not registered with this password, proceed to registerUser
    }

    await directusClient.request(
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
   * Hand off to Directus hosted OAuth flow (e.g. google).
   * Directus redirects back to /auth/callback with access_token, refresh_token, expires.
   */
  loginWithProvider(
    provider: 'google' | 'apple',
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

    // Also sync Directus client instance token
    await directusClient.setToken(accessToken);

    const user = await this.loadCurrentUser();
    this.userSubject.next(user);
    this.scheduleProactiveRefresh();

    return user;
  }

  // ======================================================
  // 🔹 LOGOUT
  // ======================================================

  async logout(redirect: boolean = true): Promise<void> {
    if (this.proactiveRefreshTimer) {
      clearTimeout(this.proactiveRefreshTimer);
      this.proactiveRefreshTimer = null;
    }

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
    if (!token) throw new Error('Not authenticated');

    const flowId = runtimeConfig.deleteAccountFlow;
    if (!flowId) {
      throw new Error('DELETE_ACCOUNT_FLOW_NOT_CONFIGURED');
    }

    const url = `${runtimeConfig.directusUrl}/flows/trigger/${flowId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Account deletion failed (${response.status}): ${body}`);
    }

    await this.logout(false);
  }

  // ======================================================
  // 🔹 NETWORK LISTENER
  // ======================================================

  private setupNetworkListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.restoreSession();
      });
    }
  }
}
