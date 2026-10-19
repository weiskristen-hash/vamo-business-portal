import { Injectable, signal } from '@angular/core';
import { runtimeConfig } from '../config/runtime-config';

export type AppleAuthErrorCode =
  | 'SCRIPT_LOAD_FAILED'
  | 'NOT_CONFIGURED'
  | 'CANCELLED'
  | 'TOKEN_MISSING'
  | 'STATE_MISMATCH'
  | 'NONCE_MISMATCH'
  | 'INVALID_TOKEN'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'TOKEN_EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'UNAVAILABLE';

export class AppleAuthError extends Error {
  constructor(
    message: string,
    public readonly code: AppleAuthErrorCode
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

export interface AppleJwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

export interface AppleJwks {
  keys: AppleJwk[];
}

export interface AppleJwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

export interface AppleJwtPayload {
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  sub: string;
  nonce?: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  [key: string]: unknown;
}

export interface AppleTokenVerifyOptions {
  expectedNonce?: string;
  expectedAudience?: string;
  nowMs?: number;
  jwks?: AppleJwks;
}

export const APPLE_SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_FUTURE_IAT_SKEW_MS = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class AppleAuthService {
  private scriptLoadPromise: Promise<void> | null = null;
  private cachedJwks: { jwks: AppleJwks; expiresAt: number } | null = null;
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
   * Computes the lowercase hex SHA-256 digest of a UTF-8 string using Web Crypto API.
   */
  async sha256Hex(input: string): Promise<string> {
    if (typeof crypto === 'undefined' || !crypto.subtle?.digest) {
      throw new AppleAuthError('Web Crypto API is unavailable for nonce hashing', 'UNAVAILABLE');
    }
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Sets or clears cached Apple JWKS (used for isolated offline tests).
   */
  setJwksCache(jwks: AppleJwks | null, ttlMs = JWKS_CACHE_TTL_MS): void {
    this.cachedJwks = jwks ? { jwks, expiresAt: Date.now() + ttlMs } : null;
  }

  /**
   * Fetches Apple's published JSON Web Key Set from https://appleid.apple.com/auth/keys.
   */
  async fetchAppleJwks(forceRefresh = false): Promise<AppleJwks> {
    if (!forceRefresh && this.cachedJwks && this.cachedJwks.expiresAt > Date.now()) {
      return this.cachedJwks.jwks;
    }

    let response: Response;
    try {
      response = await fetch(APPLE_JWKS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new AppleAuthError('Failed to fetch Apple public keys for JWT verification', 'UNAVAILABLE');
    }

    if (!response.ok) {
      throw new AppleAuthError('Apple JWKS endpoint returned an error status', 'UNAVAILABLE');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AppleAuthError('Malformed response from Apple JWKS endpoint', 'UNAVAILABLE');
    }

    const keys = (data as AppleJwks | null)?.keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new AppleAuthError('Apple JWKS response did not contain any signing keys', 'UNAVAILABLE');
    }

    const jwks: AppleJwks = { keys };
    this.cachedJwks = { jwks, expiresAt: Date.now() + JWKS_CACHE_TTL_MS };
    return jwks;
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

  private base64UrlToUint8Array(base64Url: string): Uint8Array {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private decodeBase64UrlJson<T>(segment: string): T | null {
    try {
      const bytes = this.base64UrlToUint8Array(segment);
      const json = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
      return null;
    }
  }

  /**
   * Verifies an Apple identity_token JWT's structure, header (RS256 + kid),
   * claims (iss, aud, exp, iat, sub, nonce), and RS256 cryptographic signature
   * against Apple's published JWKS using Web Crypto API.
   *
   * Note: Client-side verification is a defense-in-depth control at the browser
   * boundary and does not replace server-side verification in Directus.
   */
  async verifyIdentityToken(
    identityToken: string,
    options: AppleTokenVerifyOptions = {}
  ): Promise<AppleJwtPayload> {
    if (!identityToken || typeof identityToken !== 'string' || !identityToken.trim()) {
      throw new AppleAuthError('Apple identity_token is missing', 'TOKEN_MISSING');
    }

    const parts = identityToken.trim().split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new AppleAuthError('Invalid Apple identity_token JWT format', 'INVALID_TOKEN');
    }

    const header = this.decodeBase64UrlJson<AppleJwtHeader>(parts[0]);
    if (
      !header ||
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      !header.kid.trim()
    ) {
      throw new AppleAuthError('Invalid Apple JWT header or unsupported algorithm', 'INVALID_TOKEN');
    }

    const payload = this.decodeBase64UrlJson<AppleJwtPayload>(parts[1]);
    if (!payload) {
      throw new AppleAuthError('Malformed Apple JWT payload', 'INVALID_TOKEN');
    }

    if (payload.iss !== APPLE_ISSUER) {
      throw new AppleAuthError('Invalid Apple token issuer', 'INVALID_ISSUER');
    }

    const expectedAudience = options.expectedAudience ?? runtimeConfig.appleClientId;
    if (!expectedAudience) {
      throw new AppleAuthError('Apple Services ID is not configured', 'NOT_CONFIGURED');
    }

    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : typeof payload.aud === 'string'
        ? [payload.aud]
        : [];
    if (!audiences.includes(expectedAudience)) {
      throw new AppleAuthError('Invalid Apple token audience', 'INVALID_AUDIENCE');
    }

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new AppleAuthError('Apple token is missing subject identifier', 'INVALID_TOKEN');
    }

    const nowMs = options.nowMs ?? Date.now();
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp * 1000 <= nowMs) {
      throw new AppleAuthError('Apple identity token has expired', 'TOKEN_EXPIRED');
    }

    if (payload.iat !== undefined) {
      if (
        typeof payload.iat !== 'number' ||
        !Number.isFinite(payload.iat) ||
        payload.iat * 1000 > nowMs + MAX_FUTURE_IAT_SKEW_MS
      ) {
        throw new AppleAuthError('Invalid Apple token issued-at claim', 'INVALID_TOKEN');
      }
    }

    if (options.expectedNonce !== undefined) {
      const tokenNonce = typeof payload.nonce === 'string' ? payload.nonce : '';
      if (!tokenNonce) {
        throw new AppleAuthError('Apple Sign-In nonce claim is missing', 'NONCE_MISMATCH');
      }
      const hashedExpected = await this.sha256Hex(options.expectedNonce);
      const matchesRaw = tokenNonce === options.expectedNonce;
      const matchesSha256 = tokenNonce.toLowerCase() === hashedExpected.toLowerCase();
      if (!matchesRaw && !matchesSha256) {
        throw new AppleAuthError('Apple Sign-In nonce mismatch', 'NONCE_MISMATCH');
      }
    }

    await this.verifyRs256Signature(parts[0], parts[1], parts[2], header.kid, options.jwks);

    return payload;
  }

  private async verifyRs256Signature(
    headerB64: string,
    payloadB64: string,
    signatureB64: string,
    kid: string,
    overrideJwks?: AppleJwks
  ): Promise<void> {
    if (typeof crypto === 'undefined' || !crypto.subtle?.importKey || !crypto.subtle?.verify) {
      throw new AppleAuthError('Web Crypto API is unavailable for JWT signature verification', 'UNAVAILABLE');
    }

    let jwks = overrideJwks ?? (await this.fetchAppleJwks(false));
    let jwk = jwks.keys.find((k) => k.kid === kid && k.kty === 'RSA');

    if (!jwk && !overrideJwks) {
      jwks = await this.fetchAppleJwks(true);
      jwk = jwks.keys.find((k) => k.kid === kid && k.kty === 'RSA');
    }

    if (!jwk || !jwk.n || !jwk.e || (jwk.alg && jwk.alg !== 'RS256')) {
      throw new AppleAuthError('No matching Apple public key found for token kid', 'INVALID_SIGNATURE');
    }

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = this.base64UrlToUint8Array(signatureB64);
    } catch {
      throw new AppleAuthError('Malformed Apple JWT signature encoding', 'INVALID_SIGNATURE');
    }

    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        'jwk',
        {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          ext: true,
        },
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: 'SHA-256' },
        },
        false,
        ['verify']
      );
    } catch {
      throw new AppleAuthError('Failed to import Apple JWK public key', 'INVALID_SIGNATURE');
    }

    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    let isValid = false;
    try {
      isValid = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        signatureBytes as BufferSource,
        signingInput as BufferSource
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new AppleAuthError('Apple identity token RS256 signature is invalid', 'INVALID_SIGNATURE');
    }
  }

  /**
   * Initializes AppleID.auth and triggers the popup sign-in flow.
   * Verifies state, nonce, claims, and RS256 signature, and extracts identity_token
   * and optional first-time user.name.
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
      throw new AppleAuthError('Apple Sign-In failed during authorization', 'UNAVAILABLE');
    }

    const authorization = response?.authorization;
    if (!authorization || typeof authorization !== 'object') {
      throw new AppleAuthError('Malformed response from Apple Sign-In', 'TOKEN_MISSING');
    }

    if (!authorization.state || authorization.state !== generatedState) {
      throw new AppleAuthError('Apple Sign-In state mismatch', 'STATE_MISMATCH');
    }

    const identityToken = authorization.id_token;
    if (!identityToken || typeof identityToken !== 'string' || !identityToken.trim()) {
      throw new AppleAuthError('Apple Sign-In did not return an identity_token', 'TOKEN_MISSING');
    }

    await this.verifyIdentityToken(identityToken, {
      expectedNonce: generatedNonce,
      expectedAudience: clientId,
    });

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
      identityToken: identityToken.trim(),
      authorizationCode:
        typeof authorization.code === 'string' ? authorization.code : undefined,
      userName,
    };
  }
}
