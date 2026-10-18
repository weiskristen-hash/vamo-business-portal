import { Injectable, signal } from '@angular/core';
import { runtimeConfig } from '../config/runtime-config';

export class AppleAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'SCRIPT_LOAD_FAILED'
      | 'NOT_CONFIGURED'
      | 'CANCELLED'
      | 'TOKEN_MISSING'
      | 'STATE_MISMATCH'
      | 'NONCE_MISMATCH'
      | 'UNAVAILABLE'
  ) {
    super(message);
    this.name = 'AppleAuthError';
  }
}

export interface AppleSignInResult {
  identityToken: string;
  authorizationCode?: string;
  userName?: {
    firstName?: string;
    lastName?: string;
  } | null;
}

const APPLE_SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

@Injectable({
  providedIn: 'root',
})
export class AppleAuthService {
  private scriptLoadPromise: Promise<void> | null = null;
  readonly sdkReady = signal<boolean>(false);
  readonly sdkLoadFailed = signal<boolean>(false);

  /**
   * Generates a cryptographically secure random hex string using Web Crypto API.
   */
  generateRandomToken(byteLength = 16): string {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(byteLength);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    throw new AppleAuthError(
      'Cryptographically secure random generator is unavailable in this browser.',
      'UNAVAILABLE'
    );
  }

  /**
   * Dynamically loads the official Apple JS SDK script once and caches the promise.
   */
  loadScript(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(
        new AppleAuthError('Apple Sign-In requires a browser environment', 'UNAVAILABLE')
      );
    }

    if ((window as any).AppleID?.auth) {
      this.sdkReady.set(true);
      this.sdkLoadFailed.set(false);
      return Promise.resolve();
    }

    if (this.scriptLoadPromise) {
      return this.scriptLoadPromise;
    }

    this.scriptLoadPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(
        `script[src="${APPLE_SDK_URL}"]`
      ) as HTMLScriptElement | null;

      if (existingScript) {
        if ((window as any).AppleID?.auth) {
          this.sdkReady.set(true);
          this.sdkLoadFailed.set(false);
          resolve();
          return;
        }
        existingScript.addEventListener('load', () => {
          this.sdkReady.set(true);
          this.sdkLoadFailed.set(false);
          resolve();
        });
        existingScript.addEventListener('error', () => {
          this.scriptLoadPromise = null;
          this.sdkLoadFailed.set(true);
          reject(new AppleAuthError('Failed to load Apple Sign-In SDK', 'SCRIPT_LOAD_FAILED'));
        });
        return;
      }

      const script = document.createElement('script');
      script.src = APPLE_SDK_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if ((window as any).AppleID?.auth) {
          this.sdkReady.set(true);
          this.sdkLoadFailed.set(false);
          resolve();
        } else {
          this.scriptLoadPromise = null;
          this.sdkLoadFailed.set(true);
          reject(
            new AppleAuthError(
              'Apple Sign-In SDK loaded without AppleID.auth interface',
              'SCRIPT_LOAD_FAILED'
            )
          );
        }
      };
      script.onerror = () => {
        this.scriptLoadPromise = null;
        this.sdkLoadFailed.set(true);
        reject(new AppleAuthError('Failed to load Apple Sign-In SDK', 'SCRIPT_LOAD_FAILED'));
      };
      document.head.appendChild(script);
    });

    return this.scriptLoadPromise;
  }

  /**
   * Decodes the payload segment of a JWT without logging or exposing raw token contents.
   */
  private decodeJwtPayload(jwt: string): Record<string, any> | null {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) return null;
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const json = atob(base64);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /**
   * Initializes AppleID.auth and triggers the popup sign-in flow.
   * Verifies state and nonce, and extracts identity_token and optional first-time user.name.
   */
  async signIn(): Promise<AppleSignInResult> {
    const clientId = runtimeConfig.appleClientId;
    const redirectURI = runtimeConfig.appleRedirectUri;

    if (!clientId || !redirectURI) {
      throw new AppleAuthError('Apple Sign-In is not configured', 'NOT_CONFIGURED');
    }

    await this.loadScript();

    const appleAuth = (window as any).AppleID?.auth;
    if (!appleAuth || typeof appleAuth.init !== 'function' || typeof appleAuth.signIn !== 'function') {
      throw new AppleAuthError('Apple Sign-In SDK is unavailable', 'UNAVAILABLE');
    }

    const generatedState = this.generateRandomToken(16);
    const generatedNonce = this.generateRandomToken(16);

    try {
      appleAuth.init({
        clientId,
        scope: 'name email',
        redirectURI,
        state: generatedState,
        nonce: generatedNonce,
        usePopup: true,
      });
    } catch {
      throw new AppleAuthError('Failed to initialize Apple Sign-In SDK', 'UNAVAILABLE');
    }

    let response: any;
    try {
      response = await appleAuth.signIn();
    } catch (err: any) {
      const errorCode = String(err?.error || err?.code || err?.message || '').toLowerCase();
      if (
        errorCode.includes('popup_closed_by_user') ||
        errorCode.includes('user_trigger_new_signin_flow') ||
        errorCode.includes('cancelled') ||
        errorCode.includes('canceled')
      ) {
        throw new AppleAuthError('Apple Sign-In was cancelled by the user', 'CANCELLED');
      }
      throw new AppleAuthError(
        err?.error ? `Apple Sign-In error: ${err.error}` : 'Apple Sign-In failed',
        'UNAVAILABLE'
      );
    }

    const authorization = response?.authorization;
    if (!authorization || typeof authorization !== 'object') {
      throw new AppleAuthError('Malformed response from Apple Sign-In', 'TOKEN_MISSING');
    }

    if (!authorization.state || authorization.state !== generatedState) {
      throw new AppleAuthError('Apple Sign-In state mismatch', 'STATE_MISMATCH');
    }

    const identityToken = authorization.id_token;
    if (!identityToken || typeof identityToken !== 'string') {
      throw new AppleAuthError('Apple Sign-In did not return an identity_token', 'TOKEN_MISSING');
    }

    // Verify nonce claim in JWT payload if present
    const payload = this.decodeJwtPayload(identityToken);
    if (payload?.['nonce'] && payload['nonce'] !== generatedNonce) {
      throw new AppleAuthError('Apple Sign-In nonce mismatch', 'NONCE_MISMATCH');
    }

    const rawFirst = response?.user?.name?.firstName;
    const rawLast = response?.user?.name?.lastName;
    const hasName =
      (typeof rawFirst === 'string' && rawFirst.trim().length > 0) ||
      (typeof rawLast === 'string' && rawLast.trim().length > 0);

    const userName = hasName
      ? {
          firstName: typeof rawFirst === 'string' ? rawFirst.trim() : '',
          lastName: typeof rawLast === 'string' ? rawLast.trim() : '',
        }
      : null;

    return {
      identityToken,
      authorizationCode:
        typeof authorization.code === 'string' ? authorization.code : undefined,
      userName,
    };
  }
}
