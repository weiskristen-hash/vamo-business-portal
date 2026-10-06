import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { createItem, passwordRequest, readMe, registerUser } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { runtimeConfig } from '../config/runtime-config';
import { createBrowserAuthStorage } from '../directus/browser-auth.storage';
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
      const code = err?.errors?.[0]?.extensions?.code;
      const isExpired = code === 'TOKEN_EXPIRED';

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
          console.warn('[AuthService] Token refresh failed, logging out session:', err);
          await this.logout(false);
          return false;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
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

  async login(email: string, password: string, timeoutMs: number = 12000): Promise<VamoUser> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const timeoutErr = new Error('Authentication request timed out. Please check your connection and try again.');
        (timeoutErr as any).code = 'LOGIN_TIMEOUT';
        reject(timeoutErr);
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          await directusClient.login({ email, password });
          const user = await this.loadCurrentUser();
          this.userSubject.next(user);
          this.scheduleProactiveRefresh();
          return user;
        })(),
        timeoutPromise,
      ]);
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
