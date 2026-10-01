import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { passwordRequest, readMe } from '@directus/sdk';
import { directusClient } from '../directus/directus-client';
import { VamoUser } from '../models/user.model';
import { environment } from '../../../environments/environment';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);

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

  async loadCurrentUser(): Promise<VamoUser> {
    return directusClient.request<VamoUser>(
      readMe({
        fields: [
          '*',
          'provider_link.*',
          'provider_link.logo.*',
          'provider_link.images.directus_files_id.*',
        ] as any,
      })
    );
  }

  // ======================================================
  // 🔹 LOGIN
  // ======================================================

  async login(email: string, password: string): Promise<VamoUser> {
    await directusClient.login({ email, password });

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
