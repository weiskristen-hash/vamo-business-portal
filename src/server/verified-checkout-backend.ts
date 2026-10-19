/**
 * VAMO Business Portal — Isolated Verified Stripe Checkout Backend
 *
 * Provides server-side endpoints for:
 *  - POST /api/checkout/preview
 *  - POST /api/checkout/create-subscription
 *
 * Security & Compatibility Guarantees:
 *  1. Zero dependency on modifying shared Directus Flows in the VAMO mobile app backend.
 *  2. Authenticates business users via Directus `/users/me` using the caller's Bearer token.
 *  3. Verifies customer ownership (email + provider_link) before previewing or creating subscriptions.
 *  4. Validates promotion codes and coupon restrictions server-side against Stripe (active, expiry,
 *     redemption limits, product restrictions, customer restrictions, minimum amount, first-time customer).
 *  5. Retrieves authoritative totals via Stripe Invoice Preview (`POST /v1/invoices/create_preview`).
 *  6. Signs a short-lived `verificationReference` (HMAC-SHA256) binding userId, email, customerId,
 *     priceId, promotionCodeId, subtotal, discountAmount, tax, amountDueToday, currency, and expiresAt.
 *  7. Enforces a pre-charge hard stop on `latest_invoice` after creating the subscription with
 *     `payment_behavior=default_incomplete`. If `latest_invoice.amount_due > approvedAmountDue`,
 *     if a $0.00 approval produces a chargeable PaymentIntent, or if an approved promotion code
 *     failed to apply, the newly created incomplete subscription is immediately canceled before
 *     any `clientSecret` can reach the browser.
 *  8. Preserves 100% compatibility with VAMO mobile app subscription lookup, entitlements,
 *     plan changes, cancellations, billing history, and saved payment methods.
 */

export interface CheckoutBackendEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_CHECKOUT_VERIFICATION_SECRET?: string;
  DIRECTUS_URL?: string;
  ALLOWED_ORIGINS?: string;
  VERIFICATION_TTL_MS?: string | number;
}

export type CheckoutBackendAuditEventType =
  | 'promotion_submitted'
  | 'promotion_validation_succeeded'
  | 'promotion_validation_failed'
  | 'invoice_preview_created'
  | 'amount_displayed_for_approval'
  | 'subscription_creation_attempted'
  | 'first_invoice_verified'
  | 'amount_mismatch_blocked'
  | 'payment_succeeded'
  | 'payment_failed';

export interface CheckoutBackendAuditEvent {
  eventType: CheckoutBackendAuditEventType;
  correlationId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface CheckoutBackendOptions {
  env: CheckoutBackendEnv;
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
  onAuditEvent?: (event: CheckoutBackendAuditEvent) => void;
  idempotencyStore?: Map<string, IdempotencyEntry>;
}

export interface IdempotencyEntry {
  status: 'in_flight' | 'completed';
  createdAt: number;
  userId: string;
  subscriptionId?: string;
}

export interface AuthenticatedDirectusUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  providerId: string | null;
  providerName: string | null;
  subscriptionTier: string | null;
}

export interface SignedVerificationPayload {
  v: 2;
  userId: string;
  email: string;
  customerId: string | null;
  priceId: string;
  promotionCode: string | null;
  promotionCodeId: string | null;
  originalPrice: number;
  subtotal: number;
  discountAmount: number;
  tax: number;
  amountDueToday: number;
  renewalAmount: number;
  currency: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

const DEFAULT_DIRECTUS_URL = 'https://api.vamo-app.com';
const ALLOWED_DIRECTUS_HOSTS = ['api.vamo-app.com', 'quepasa-api.c1oud7.de', 'vamo-app.com'];
const DEFAULT_VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;
const PROMO_ID_PATTERN = /^promo_[A-Za-z0-9_]+$/;
const PAYMENT_METHOD_ID_PATTERN = /^pm_[A-Za-z0-9_]+$/;

const globalIdempotencyStore = new Map<string, IdempotencyEntry>();

const SENSITIVE_KEY_PATTERN =
  /^(client_?secret|secret|token|access_?token|refresh_?token|authorization|password|card|cvc|cvv|pan|number|stripe_?secret_?key)$/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+)\b/g,
  /\b(seti_[A-Za-z0-9]+_secret_[A-Za-z0-9]+)\b/g,
  /\b(sk_(?:live|test)_[A-Za-z0-9]+)\b/g,
  /\b(rk_(?:live|test)_[A-Za-z0-9]+)\b/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

export function redactServerValue(value: unknown, keyName?: string): unknown {
  if (keyName && SENSITIVE_KEY_PATTERN.test(keyName)) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    let sanitized = value;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactServerValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactServerValue(v, k);
    }
    return out;
  }
  return '[UNSERIALIZABLE]';
}

function emitAudit(
  options: CheckoutBackendOptions,
  eventType: CheckoutBackendAuditEventType,
  correlationId: string,
  metadata: Record<string, unknown>,
): void {
  const now = options.nowFn ? options.nowFn() : Date.now();
  const event: CheckoutBackendAuditEvent = {
    eventType,
    correlationId,
    timestamp: new Date(now).toISOString(),
    metadata: redactServerValue(metadata) as Record<string, unknown>,
  };
  if (options.onAuditEvent) {
    options.onAuditEvent(event);
  }
}

function base64UrlEncodeString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeString(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const withPad = padded + '='.repeat(padLen);
  const binary = atob(withPad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(sigBuffer));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signVerificationReference(
  payload: SignedVerificationPayload,
  secret: string,
): Promise<string> {
  const jsonStr = JSON.stringify(payload);
  const encoded = base64UrlEncodeString(jsonStr);
  const signature = await computeHmacSha256Hex(secret, encoded);
  return `vref_2_${encoded}.${signature}`;
}

export async function verifySignedVerificationReference(
  token: string,
  secret: string,
  nowMs: number,
): Promise<
  | { valid: true; payload: SignedVerificationPayload }
  | { valid: false; code: 'TAMPERED_VERIFICATION_REFERENCE' | 'EXPIRED_VERIFICATION_REFERENCE'; message: string }
> {
  if (!token || typeof token !== 'string' || !token.startsWith('vref_2_')) {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Invalid or unrecognized verification reference format.',
    };
  }

  const bodyPart = token.slice('vref_2_'.length);
  const dotIndex = bodyPart.indexOf('.');
  if (dotIndex <= 0 || dotIndex === bodyPart.length - 1) {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Malformed verification reference structure.',
    };
  }

  const encodedPayload = bodyPart.slice(0, dotIndex);
  const providedSig = bodyPart.slice(dotIndex + 1);
  if (!/^[0-9a-f]{64}$/i.test(providedSig)) {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Invalid verification reference signature.',
    };
  }

  const expectedSig = await computeHmacSha256Hex(secret, encodedPayload);
  if (!constantTimeEqual(providedSig.toLowerCase(), expectedSig.toLowerCase())) {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Verification reference signature mismatch.',
    };
  }

  let parsed: SignedVerificationPayload;
  try {
    parsed = JSON.parse(base64UrlDecodeString(encodedPayload));
  } catch {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Verification reference payload could not be decoded.',
    };
  }

  if (
    !parsed ||
    parsed.v !== 2 ||
    typeof parsed.userId !== 'string' ||
    typeof parsed.email !== 'string' ||
    typeof parsed.priceId !== 'string' ||
    typeof parsed.amountDueToday !== 'number' ||
    !Number.isFinite(parsed.amountDueToday) ||
    typeof parsed.currency !== 'string' ||
    typeof parsed.issuedAt !== 'number' ||
    typeof parsed.expiresAt !== 'number' ||
    typeof parsed.nonce !== 'string'
  ) {
    return {
      valid: false,
      code: 'TAMPERED_VERIFICATION_REFERENCE',
      message: 'Verification reference payload is incomplete.',
    };
  }

  if (nowMs > parsed.expiresAt || nowMs < parsed.issuedAt - 60_000) {
    return {
      valid: false,
      code: 'EXPIRED_VERIFICATION_REFERENCE',
      message: 'Checkout price verification has expired. Please re-verify your total before paying.',
    };
  }

  return { valid: true, payload: parsed };
}

function resolveSafeDirectusUrl(configuredUrl?: string): string {
  const raw = (configuredUrl || DEFAULT_DIRECTUS_URL).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return DEFAULT_DIRECTUS_URL;
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_DIRECTUS_HOSTS.some(
      (base) => host === base || host.endsWith(`.${base}`),
    );
    return allowed ? raw : DEFAULT_DIRECTUS_URL;
  } catch {
    return DEFAULT_DIRECTUS_URL;
  }
}

async function authenticateDirectusUser(
  request: Request,
  directusUrl: string,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; user: AuthenticatedDirectusUser }
  | { ok: false; status: number; code: string; message: string }
> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader.trim());
  if (!match || !match[1]) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Authentication is required to verify or create a subscription.',
    };
  }

  const token = match[1];
  const fields = [
    'id',
    'email',
    'first_name',
    'last_name',
    'status',
    'provider_link.id',
    'provider_link.name',
    'provider_link.subscription_tier',
  ].join(',');

  let res: Response;
  try {
    res = await fetchImpl(`${directusUrl}/users/me?fields=${encodeURIComponent(fields)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      message: 'Could not verify your account session with Directus. Please try again.',
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_AUTH_TOKEN',
      message: 'Your session has expired. Please sign in again to continue checkout.',
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      message: 'Could not verify your account session at this time.',
    };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      message: 'Invalid account verification response.',
    };
  }

  const userObj = body?.data ?? body;
  const userId = typeof userObj?.id === 'string' ? userObj.id.trim() : '';
  const email = typeof userObj?.email === 'string' ? userObj.email.trim().toLowerCase() : '';
  if (!userId || !email) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_USER_IDENTITY',
      message: 'Authenticated user record is missing required identity fields.',
    };
  }

  if (userObj?.status && userObj.status !== 'active') {
    return {
      ok: false,
      status: 403,
      code: 'USER_NOT_ACTIVE',
      message: 'Your user account is not active.',
    };
  }

  const firstName = typeof userObj?.first_name === 'string' ? userObj.first_name.trim() : '';
  const lastName = typeof userObj?.last_name === 'string' ? userObj.last_name.trim() : '';
  const providerObj =
    userObj?.provider_link && typeof userObj.provider_link === 'object'
      ? userObj.provider_link
      : null;
  const providerId =
    typeof providerObj?.id === 'string'
      ? providerObj.id.trim()
      : typeof userObj?.provider_link === 'string'
        ? userObj.provider_link.trim()
        : null;
  const providerName =
    typeof providerObj?.name === 'string' && providerObj.name.trim()
      ? providerObj.name.trim()
      : null;
  const subscriptionTier =
    typeof providerObj?.subscription_tier === 'string' ? providerObj.subscription_tier : null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || providerName || email;

  return {
    ok: true,
    user: {
      id: userId,
      email,
      firstName,
      lastName,
      fullName,
      providerId,
      providerName,
      subscriptionTier,
    },
  };
}

interface StripeClient {
  request<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    params?: Record<string, string | string[] | undefined>,
    idempotencyKey?: string,
  ): Promise<T>;
}

function createStripeClient(secretKey: string, fetchImpl: typeof fetch): StripeClient {
  return {
    async request<T = any>(
      path: string,
      method: 'GET' | 'POST' | 'DELETE',
      params?: Record<string, string | string[] | undefined>,
      idempotencyKey?: string,
    ): Promise<T> {
      const cleanPath = path.replace(/^\/+/, '');
      let url = `https://api.stripe.com/v1/${cleanPath}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      };

      const searchParams = new URLSearchParams();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) {
              searchParams.append(key, item);
            }
          } else {
            searchParams.append(key, value);
          }
        }
      }

      const init: RequestInit = { method, headers };
      if (method === 'GET' || method === 'DELETE') {
        const qs = searchParams.toString();
        if (qs) {
          url += `?${qs}`;
        }
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        if (idempotencyKey) {
          headers['Idempotency-Key'] = idempotencyKey;
        }
        init.body = searchParams.toString();
      }

      const res = await fetchImpl(url, init);
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok) {
        const errMessage =
          (json && json.error && typeof json.error.message === 'string' && json.error.message) ||
          `Stripe API error (${res.status})`;
        const err: any = new Error(errMessage);
        err.status = res.status;
        err.code = (json && json.error && json.error.code) || 'stripe_api_error';
        err.type = (json && json.error && json.error.type) || 'api_error';
        throw err;
      }

      return json as T;
    },
  };
}

interface PromotionValidationOutcome {
  eligible: boolean;
  reasonCode?: string;
  message?: string;
  promoObj?: any;
  couponObj?: any;
}

async function validatePromotionEligibility(params: {
  stripe: StripeClient;
  promotionCode?: string | null;
  promotionCodeId?: string | null;
  productId: string;
  originalPrice: number;
  currency: string;
  customer: any | null;
  nowSec: number;
}): Promise<PromotionValidationOutcome> {
  const {
    stripe,
    promotionCode,
    promotionCodeId,
    productId,
    originalPrice,
    currency,
    customer,
    nowSec,
  } = params;

  let promoObj: any = null;

  if (promotionCodeId) {
    if (!PROMO_ID_PATTERN.test(promotionCodeId)) {
      return {
        eligible: false,
        reasonCode: 'INVALID_PROMOTION_ID',
        message: 'Invalid promotion code identifier.',
      };
    }
    try {
      promoObj = await stripe.request(
        `promotion_codes/${encodeURIComponent(promotionCodeId)}`,
        'GET',
        { 'expand[]': ['coupon.applies_to'] },
      );
    } catch {
      return {
        eligible: false,
        reasonCode: 'PROMOTION_NOT_FOUND',
        message: 'This promotion code is invalid or no longer available.',
      };
    }
  } else if (promotionCode) {
    const cleanCode = promotionCode.trim();
    if (!PROMO_CODE_PATTERN.test(cleanCode)) {
      return {
        eligible: false,
        reasonCode: 'INVALID_PROMOTION_FORMAT',
        message: 'Invalid promotion code format.',
      };
    }

    const listRes = await stripe.request('promotion_codes', 'GET', {
      code: cleanCode,
      limit: '10',
      'expand[]': ['data.coupon.applies_to'],
    });
    const candidates: any[] = Array.isArray(listRes?.data) ? listRes.data : [];
    const matching = candidates.filter(
      (item) => typeof item?.code === 'string' && item.code.toUpperCase() === cleanCode.toUpperCase(),
    );
    // Prefer an active candidate if multiple exist with same code, else first match
    promoObj = matching.find((item) => item.active === true) ?? matching[0] ?? null;
  }

  if (!promoObj || typeof promoObj.id !== 'string') {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_NOT_FOUND',
      message: 'This promotion code is invalid or not recognized.',
    };
  }

  const couponObj = promoObj.coupon && typeof promoObj.coupon === 'object' ? promoObj.coupon : null;
  if (!couponObj) {
    return {
      eligible: false,
      reasonCode: 'COUPON_MISSING',
      message: 'This promotion code has no valid coupon configuration.',
    };
  }

  // Check expiration before generic active flag so expired promotions return PROMOTION_EXPIRED
  if (typeof promoObj.expires_at === 'number' && promoObj.expires_at <= nowSec) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_EXPIRED',
      message: 'This promotion code has expired.',
    };
  }
  if (typeof couponObj.redeem_by === 'number' && couponObj.redeem_by <= nowSec) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_EXPIRED',
      message: 'This coupon has expired.',
    };
  }

  // Check redemption limits
  if (
    typeof promoObj.max_redemptions === 'number' &&
    typeof promoObj.times_redeemed === 'number' &&
    promoObj.times_redeemed >= promoObj.max_redemptions
  ) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_MAX_REDEMPTIONS_REACHED',
      message: 'This promotion code has reached its redemption limit.',
    };
  }
  if (
    typeof couponObj.max_redemptions === 'number' &&
    typeof couponObj.times_redeemed === 'number' &&
    couponObj.times_redeemed >= couponObj.max_redemptions
  ) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_MAX_REDEMPTIONS_REACHED',
      message: 'This coupon has reached its redemption limit.',
    };
  }

  if (promoObj.active !== true || couponObj.valid !== true) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_INACTIVE',
      message: 'This promotion code is inactive or no longer valid.',
    };
  }

  // Check customer restriction (promo.customer or promo.restrictions.customer)
  const restrictedCustomerId =
    (typeof promoObj.customer === 'string' && promoObj.customer.trim()) ||
    (promoObj.customer && typeof promoObj.customer === 'object' && promoObj.customer.id) ||
    (promoObj.restrictions &&
      typeof promoObj.restrictions.customer === 'string' &&
      promoObj.restrictions.customer.trim()) ||
    null;

  if (restrictedCustomerId) {
    if (!customer || customer.id !== restrictedCustomerId) {
      return {
        eligible: false,
        reasonCode: 'PROMOTION_CUSTOMER_RESTRICTED',
        message: 'This promotion code is restricted to a different customer account.',
      };
    }
  }

  // Check product / price applicability
  const allowedProducts: string[] | null =
    couponObj.applies_to && Array.isArray(couponObj.applies_to.products)
      ? couponObj.applies_to.products
      : null;

  if (allowedProducts && allowedProducts.length > 0 && !allowedProducts.includes(productId)) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_PRODUCT_RESTRICTED',
      message: 'This promotion code does not apply to the selected subscription plan.',
    };
  }

  // Check fixed-amount coupon currency
  if (
    typeof couponObj.amount_off === 'number' &&
    couponObj.amount_off > 0 &&
    typeof couponObj.currency === 'string' &&
    couponObj.currency.toLowerCase() !== currency.toLowerCase()
  ) {
    return {
      eligible: false,
      reasonCode: 'PROMOTION_CURRENCY_MISMATCH',
      message: 'This promotion code is not valid for the selected billing currency.',
    };
  }

  // Check minimum amount restriction
  const restrictions =
    promoObj.restrictions && typeof promoObj.restrictions === 'object'
      ? promoObj.restrictions
      : null;

  if (restrictions && typeof restrictions.minimum_amount === 'number' && restrictions.minimum_amount > 0) {
    if (
      typeof restrictions.minimum_amount_currency === 'string' &&
      restrictions.minimum_amount_currency.toLowerCase() !== currency.toLowerCase()
    ) {
      return {
        eligible: false,
        reasonCode: 'PROMOTION_CURRENCY_MISMATCH',
        message: 'This promotion code is not valid for the selected billing currency.',
      };
    }
    if (originalPrice < restrictions.minimum_amount) {
      return {
        eligible: false,
        reasonCode: 'PROMOTION_MINIMUM_AMOUNT_NOT_MET',
        message: 'The selected plan does not meet the minimum amount required for this promotion code.',
      };
    }
  }

  // Check first-time transaction restriction
  if (restrictions && restrictions.first_time_transaction === true && customer && customer.id) {
    const [paidInvoices, priorSubs] = await Promise.all([
      stripe.request('invoices', 'GET', {
        customer: customer.id,
        status: 'paid',
        limit: '1',
      }),
      stripe.request('subscriptions', 'GET', {
        customer: customer.id,
        status: 'all',
        limit: '10',
      }),
    ]);

    const hasPaidInvoice = Array.isArray(paidInvoices?.data) && paidInvoices.data.length > 0;
    const hasPriorCompletedSub =
      Array.isArray(priorSubs?.data) &&
      priorSubs.data.some(
        (s: any) =>
          s &&
          typeof s.status === 'string' &&
          !['incomplete', 'incomplete_expired'].includes(s.status),
      );

    if (hasPaidInvoice || hasPriorCompletedSub) {
      return {
        eligible: false,
        reasonCode: 'PROMOTION_FIRST_TIME_CUSTOMER_ONLY',
        message: 'This promotion code is only valid for first-time subscribers.',
      };
    }
  }

  return {
    eligible: true,
    promoObj,
    couponObj,
  };
}

function sumInvoiceDiscounts(invoice: any): number {
  if (!invoice || typeof invoice !== 'object') return 0;
  if (Array.isArray(invoice.total_discount_amounts) && invoice.total_discount_amounts.length > 0) {
    return invoice.total_discount_amounts.reduce(
      (sum: number, item: any) => sum + (typeof item?.amount === 'number' ? item.amount : 0),
      0,
    );
  }
  if (invoice.discount && typeof invoice.discount.amount === 'number') {
    return invoice.discount.amount;
  }
  return 0;
}

export function isPromotionPresentOnSubscriptionOrInvoice(
  sub: any,
  invoice: any,
  expectedPromoId: string,
  expectedCouponId?: string | null,
): boolean {
  const cleanExpectedPromoId = typeof expectedPromoId === 'string' ? expectedPromoId.trim() : '';
  const cleanExpectedCouponId =
    typeof expectedCouponId === 'string' && expectedCouponId.trim()
      ? expectedCouponId.trim()
      : null;

  if (!cleanExpectedPromoId) {
    return false;
  }

  const extractIdsFromDiscountEntry = (
    entry: any,
  ): { promoId: string | null; couponId: string | null; hasUnrelatedDiscountObject: boolean } => {
    if (!entry) {
      return { promoId: null, couponId: null, hasUnrelatedDiscountObject: false };
    }
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.startsWith('promo_')) {
        return { promoId: trimmed, couponId: null, hasUnrelatedDiscountObject: false };
      }
      if (trimmed.startsWith('coupon_')) {
        return { promoId: null, couponId: trimmed, hasUnrelatedDiscountObject: false };
      }
      return { promoId: null, couponId: null, hasUnrelatedDiscountObject: false };
    }
    if (typeof entry === 'object') {
      const promoId =
        typeof entry.promotion_code === 'string' && entry.promotion_code.trim()
          ? entry.promotion_code.trim()
          : typeof entry.promotion_code?.id === 'string' && entry.promotion_code.id.trim()
            ? entry.promotion_code.id.trim()
            : typeof entry.source?.promotion_code === 'string' && entry.source.promotion_code.trim()
              ? entry.source.promotion_code.trim()
              : typeof entry.source?.promotion_code?.id === 'string' &&
                  entry.source.promotion_code.id.trim()
                ? entry.source.promotion_code.id.trim()
                : null;

      const couponId =
        typeof entry.coupon === 'string' && entry.coupon.trim()
          ? entry.coupon.trim()
          : typeof entry.coupon?.id === 'string' && entry.coupon.id.trim()
            ? entry.coupon.id.trim()
            : typeof entry.source?.coupon === 'string' && entry.source.coupon.trim()
              ? entry.source.coupon.trim()
              : typeof entry.source?.coupon?.id === 'string' && entry.source.coupon.id.trim()
                ? entry.source.coupon.id.trim()
                : null;

      return {
        promoId,
        couponId,
        hasUnrelatedDiscountObject: promoId === null && couponId === null,
      };
    }
    return { promoId: null, couponId: null, hasUnrelatedDiscountObject: false };
  };

  const evaluateEntries = (entries: any[]): { matched: boolean; conflict: boolean } => {
    let matched = false;
    for (const entry of entries) {
      const { promoId, couponId } = extractIdsFromDiscountEntry(entry);
      if (promoId && promoId !== cleanExpectedPromoId) {
        return { matched: false, conflict: true };
      }
      if (couponId && cleanExpectedCouponId && couponId !== cleanExpectedCouponId) {
        return { matched: false, conflict: true };
      }
      if (couponId && !cleanExpectedCouponId && !promoId) {
        return { matched: false, conflict: true };
      }
      if (promoId === cleanExpectedPromoId) {
        matched = true;
      } else if (!promoId && cleanExpectedCouponId && couponId === cleanExpectedCouponId) {
        matched = true;
      }
    }
    return { matched, conflict: false };
  };

  const invoiceEntries: any[] = [];
  if (Array.isArray(invoice?.discounts)) {
    invoiceEntries.push(...invoice.discounts);
  }
  if (invoice?.discount) {
    invoiceEntries.push(invoice.discount);
  }
  if (Array.isArray(invoice?.total_discount_amounts)) {
    for (const item of invoice.total_discount_amounts) {
      if (item?.discount) {
        invoiceEntries.push(item.discount);
      }
    }
  }

  const subEntries: any[] = [];
  if (Array.isArray(sub?.discounts)) {
    subEntries.push(...sub.discounts);
  }
  if (sub?.discount) {
    subEntries.push(sub.discount);
  }

  const invoiceEval = evaluateEntries(invoiceEntries);
  if (invoiceEval.conflict) {
    return false;
  }

  const subEval = evaluateEntries(subEntries);
  if (subEval.conflict) {
    return false;
  }

  // If invoice has explicit discount entries, require the invoice itself to match the expected promotion/coupon
  if (invoiceEntries.length > 0) {
    return invoiceEval.matched;
  }

  // Otherwise, if only subscription-level discount entries are expanded, require an exact match there
  // AND positive discount / $0 invoice on the invoice if an invoice object was provided
  if (subEval.matched) {
    if (!invoice) {
      return true;
    }
    const discountTotal = sumInvoiceDiscounts(invoice);
    return discountTotal > 0 || invoice.amount_due === 0;
  }

  // Fail closed: never treat an unverified positive discount amount as proof of the expected promotion
  return false;
}

function buildCorsHeaders(request: Request, env: CheckoutBackendEnv): Record<string, string> {
  const origin = request.headers.get('Origin') || request.headers.get('origin') || '';
  const rawAllowed = env.ALLOWED_ORIGINS || 'https://business.vamo-app.com,http://localhost:4200';
  const allowedList = rawAllowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    origin && (allowedList.includes(origin) || allowedList.includes('*'))
      ? origin
      : allowedList[0] || 'https://business.vamo-app.com';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function jsonResponse(
  status: number,
  payload: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

async function resolveStripeCustomerByEmail(
  stripe: StripeClient,
  email: string,
  expectedUserId: string,
): Promise<
  | { ok: true; customer: any | null }
  | { ok: false; status: number; code: string; message: string }
> {
  const list = await stripe.request('customers', 'GET', {
    email: email.toLowerCase(),
    limit: '5',
  });
  const candidates: any[] = Array.isArray(list?.data) ? list.data : [];
  const activeCustomers = candidates.filter((c) => c && c.deleted !== true);
  const customer = activeCustomers[0] ?? null;

  if (
    customer &&
    customer.metadata &&
    typeof customer.metadata.vamo_user_id === 'string' &&
    customer.metadata.vamo_user_id.trim() !== '' &&
    customer.metadata.vamo_user_id.trim() !== expectedUserId
  ) {
    return {
      ok: false,
      status: 403,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'The Stripe customer record associated with this email belongs to a different user.',
    };
  }

  return { ok: true, customer };
}

/**
 * Endpoint A: POST /api/checkout/preview
 */
export async function handleCheckoutPreviewRequest(
  request: Request,
  options: CheckoutBackendOptions,
): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, options.env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowFn ? options.nowFn() : Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const correlationId =
    request.headers.get('X-Correlation-Id') || `vchk_srv_${nowMs.toString(36)}_${generateNonce().slice(0, 8)}`;

  const stripeSecret = (options.env.STRIPE_SECRET_KEY || '').trim();
  const verificationSecret = (
    options.env.STRIPE_CHECKOUT_VERIFICATION_SECRET ||
    options.env.STRIPE_SECRET_KEY ||
    ''
  ).trim();

  if (!stripeSecret || !verificationSecret) {
    return jsonResponse(
      503,
      {
        verified: false,
        verificationStatus: 'unavailable',
        couponState: 'verification_unavailable',
        code: 'BACKEND_NOT_CONFIGURED',
        error: 'Verified checkout service is not configured.',
      },
      corsHeaders,
    );
  }

  const directusUrl = resolveSafeDirectusUrl(options.env.DIRECTUS_URL);
  const authResult = await authenticateDirectusUser(request, directusUrl, fetchImpl);
  if (!authResult.ok) {
    return jsonResponse(
      authResult.status,
      {
        verified: false,
        verificationStatus: 'unavailable',
        couponState: 'verification_unavailable',
        code: authResult.code,
        error: authResult.message,
      },
      corsHeaders,
    );
  }

  const authUser = authResult.user;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      400,
      {
        verified: false,
        verificationStatus: 'unavailable',
        couponState: 'verification_unavailable',
        code: 'INVALID_JSON_BODY',
        error: 'Invalid checkout preview request payload.',
      },
      corsHeaders,
    );
  }

  // Verify customer ownership if client supplied email or providerId
  if (typeof body?.email === 'string' && body.email.trim() !== '') {
    if (body.email.trim().toLowerCase() !== authUser.email) {
      return jsonResponse(
        403,
        {
          verified: false,
          verificationStatus: 'unverified',
          couponState: 'invalid_or_ineligible',
          code: 'CUSTOMER_MISMATCH',
          error: 'Requested billing email does not match the authenticated account.',
        },
        corsHeaders,
      );
    }
  }
  if (typeof body?.providerId === 'string' && body.providerId.trim() !== '') {
    if (authUser.providerId !== body.providerId.trim()) {
      return jsonResponse(
        403,
        {
          verified: false,
          verificationStatus: 'unverified',
          couponState: 'invalid_or_ineligible',
          code: 'BUSINESS_OWNERSHIP_MISMATCH',
          error: 'Requested business profile does not belong to the authenticated account.',
        },
        corsHeaders,
      );
    }
  }

  const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : '';
  if (!priceId || !PRICE_ID_PATTERN.test(priceId)) {
    return jsonResponse(
      400,
      {
        verified: false,
        verificationStatus: 'unavailable',
        couponState: 'verification_unavailable',
        code: 'INVALID_PRICE_ID',
        error: 'A valid Stripe priceId is required.',
      },
      corsHeaders,
    );
  }

  const rawPromoCode =
    typeof body?.promotionCode === 'string' && body.promotionCode.trim().length > 0
      ? body.promotionCode.trim()
      : null;

  const stripe = createStripeClient(stripeSecret, fetchImpl);

  try {
    // 1. Retrieve authoritative Stripe Price + expanded Product
    const price = await stripe.request(`prices/${encodeURIComponent(priceId)}`, 'GET', {
      'expand[]': ['product'],
    });
    const productObj = price?.product && typeof price.product === 'object' ? price.product : null;
    const productId =
      typeof price?.product === 'string'
        ? price.product
        : typeof productObj?.id === 'string'
          ? productObj.id
          : '';

    if (
      !price ||
      price.active !== true ||
      typeof price.unit_amount !== 'number' ||
      !productId ||
      (productObj && productObj.active === false)
    ) {
      return jsonResponse(
        422,
        {
          verified: false,
          verificationStatus: 'unavailable',
          couponState: 'verification_unavailable',
          code: 'PRICE_INACTIVE_OR_INVALID',
          error: 'The selected subscription plan price is not currently available.',
        },
        corsHeaders,
      );
    }

    const originalPrice = Number(price.unit_amount);
    const currency = String(price.currency || 'usd').toLowerCase();
    const interval = String(price.recurring?.interval || 'month');
    const planName =
      (productObj && typeof productObj.name === 'string' && productObj.name) ||
      (typeof price.nickname === 'string' && price.nickname) ||
      'Subscription Plan';

    // 2. Resolve existing Stripe Customer by authenticated email
    const customerLookup = await resolveStripeCustomerByEmail(stripe, authUser.email, authUser.id);
    if (!customerLookup.ok) {
      return jsonResponse(
        customerLookup.status,
        {
          verified: false,
          verificationStatus: 'unverified',
          couponState: 'invalid_or_ineligible',
          code: customerLookup.code,
          error: customerLookup.message,
        },
        corsHeaders,
      );
    }
    const customer = customerLookup.customer;

    // 3. Validate Promotion Code if submitted
    let promoObj: any = null;
    let couponObj: any = null;
    let couponState: 'not_applied' | 'verified_applied' = 'not_applied';

    if (rawPromoCode) {
      emitAudit(options, 'promotion_submitted', correlationId, {
        userId: authUser.id,
        priceId,
        promotionCode: rawPromoCode,
      });

      const promoOutcome = await validatePromotionEligibility({
        stripe,
        promotionCode: rawPromoCode,
        productId,
        originalPrice,
        currency,
        customer,
        nowSec,
      });

      if (!promoOutcome.eligible) {
        emitAudit(options, 'promotion_validation_failed', correlationId, {
          userId: authUser.id,
          priceId,
          promotionCode: rawPromoCode,
          reasonCode: promoOutcome.reasonCode,
        });

        return jsonResponse(
          200,
          {
            verified: false,
            verificationStatus: 'unverified',
            couponState: 'invalid_or_ineligible',
            code: promoOutcome.reasonCode || 'PROMOTION_INELIGIBLE',
            error: promoOutcome.message || 'Promotion code is invalid or ineligible for this plan.',
            priceId,
            planName,
            interval,
            currency,
            originalPrice,
            subtotal: originalPrice,
            discountAmount: 0,
            tax: 0,
            amountDueToday: originalPrice,
            renewalAmount: originalPrice,
            promotionCode: rawPromoCode,
            promotionCodeId: null,
          },
          corsHeaders,
        );
      }

      promoObj = promoOutcome.promoObj;
      couponObj = promoOutcome.couponObj;
      couponState = 'verified_applied';
    }

    // 4. Create Authoritative Stripe Invoice Preview
    const previewParams: Record<string, string> = {
      'subscription_details[items][0][price]': priceId,
      'subscription_details[items][0][quantity]': '1',
    };
    if (customer && customer.id) {
      previewParams['customer'] = customer.id;
    } else {
      previewParams['currency'] = currency;
      previewParams['customer_details[email]'] = authUser.email;
    }
    if (promoObj && promoObj.id) {
      previewParams['discounts[0][promotion_code]'] = promoObj.id;
    }

    let invoicePreview: any;
    try {
      invoicePreview = await stripe.request('invoices/create_preview', 'POST', previewParams);
    } catch (previewErr: any) {
      if (rawPromoCode) {
        emitAudit(options, 'promotion_validation_failed', correlationId, {
          userId: authUser.id,
          priceId,
          promotionCode: rawPromoCode,
          reasonCode: 'STRIPE_PREVIEW_REJECTED_PROMOTION',
          stripeCode: previewErr?.code,
        });
        return jsonResponse(
          200,
          {
            verified: false,
            verificationStatus: 'unverified',
            couponState: 'invalid_or_ineligible',
            code: 'STRIPE_PREVIEW_REJECTED_PROMOTION',
            error: 'Stripe rejected this promotion code for the selected subscription.',
            priceId,
            planName,
            interval,
            currency,
            originalPrice,
            subtotal: originalPrice,
            discountAmount: 0,
            tax: 0,
            amountDueToday: originalPrice,
            renewalAmount: originalPrice,
          },
          corsHeaders,
        );
      }
      throw previewErr;
    }

    const subtotal =
      typeof invoicePreview?.subtotal === 'number' && Number.isFinite(invoicePreview.subtotal)
        ? invoicePreview.subtotal
        : originalPrice;
    const tax =
      typeof invoicePreview?.tax === 'number' && Number.isFinite(invoicePreview.tax)
        ? invoicePreview.tax
        : 0;
    const discountAmount = sumInvoiceDiscounts(invoicePreview);
    const amountDueToday =
      typeof invoicePreview?.amount_due === 'number' && Number.isFinite(invoicePreview.amount_due)
        ? invoicePreview.amount_due
        : typeof invoicePreview?.total === 'number' && Number.isFinite(invoicePreview.total)
          ? invoicePreview.total
          : null;

    if (amountDueToday === null || amountDueToday < 0) {
      return jsonResponse(
        502,
        {
          verified: false,
          verificationStatus: 'unavailable',
          couponState: 'verification_unavailable',
          code: 'INVALID_STRIPE_PREVIEW_TOTAL',
          error: 'Stripe returned an incomplete invoice preview.',
        },
        corsHeaders,
      );
    }

    // Verify that if a promotion code was requested, Stripe actually applied a discount on the preview
    if (promoObj) {
      const promoApplied = isPromotionPresentOnSubscriptionOrInvoice(
        null,
        invoicePreview,
        promoObj.id,
        couponObj?.id,
      );
      const expectedZeroBeforeTax = couponObj?.percent_off === 100 && amountDueToday > tax;
      if (!promoApplied || discountAmount <= 0 || expectedZeroBeforeTax) {
        emitAudit(options, 'promotion_validation_failed', correlationId, {
          userId: authUser.id,
          priceId,
          promotionCode: rawPromoCode,
          promotionCodeId: promoObj.id,
          reasonCode: 'PROMOTION_NOT_APPLIED_IN_PREVIEW',
          discountAmount,
          amountDueToday,
        });
        return jsonResponse(
          200,
          {
            verified: false,
            verificationStatus: 'unverified',
            couponState: 'invalid_or_ineligible',
            code: 'PROMOTION_NOT_APPLIED_IN_PREVIEW',
            error: 'Promotion code did not reduce the invoice total for this plan.',
            priceId,
            planName,
            interval,
            currency,
            originalPrice,
            subtotal: originalPrice,
            discountAmount: 0,
            tax: 0,
            amountDueToday: originalPrice,
            renewalAmount: originalPrice,
          },
          corsHeaders,
        );
      }

      emitAudit(options, 'promotion_validation_succeeded', correlationId, {
        userId: authUser.id,
        priceId,
        promotionCode: promoObj.code || rawPromoCode,
        promotionCodeId: promoObj.id,
        discountAmount,
        amountDueToday,
      });
    }

    const couponDuration: 'once' | 'repeating' | 'forever' | null =
      couponObj && ['once', 'repeating', 'forever'].includes(couponObj.duration)
        ? couponObj.duration
        : null;
    const couponDurationInMonths: number | null =
      couponObj && typeof couponObj.duration_in_months === 'number'
        ? couponObj.duration_in_months
        : null;
    const renewalAmount = couponDuration === 'forever' ? amountDueToday : originalPrice;

    const ttlMs = Number(options.env.VERIFICATION_TTL_MS) || DEFAULT_VERIFICATION_TTL_MS;
    const expiresAt = nowMs + ttlMs;
    const nonce = generateNonce();

    const signedPayload: SignedVerificationPayload = {
      v: 2,
      userId: authUser.id,
      email: authUser.email,
      customerId: customer?.id ?? null,
      priceId,
      promotionCode: promoObj ? String(promoObj.code || rawPromoCode) : null,
      promotionCodeId: promoObj ? promoObj.id : null,
      originalPrice,
      subtotal,
      discountAmount,
      tax,
      amountDueToday,
      renewalAmount,
      currency,
      issuedAt: nowMs,
      expiresAt,
      nonce,
    };

    const verificationReference = await signVerificationReference(
      signedPayload,
      verificationSecret,
    );

    emitAudit(options, 'invoice_preview_created', correlationId, {
      userId: authUser.id,
      customerId: customer?.id ?? null,
      priceId,
      promotionCodeId: promoObj?.id ?? null,
      subtotal,
      discountAmount,
      tax,
      amountDueToday,
      renewalAmount,
      currency,
      expiresAt,
    });

    return jsonResponse(
      200,
      {
        verified: true,
        verificationStatus: 'verified',
        couponState,
        priceId,
        planName,
        interval,
        currency,
        originalPrice,
        subtotal,
        discountAmount,
        tax,
        amountDueToday,
        renewalAmount,
        promotionCode: signedPayload.promotionCode,
        promotionCodeId: signedPayload.promotionCodeId,
        promotionName: couponObj ? couponObj.name || signedPayload.promotionCode : null,
        percentOff: couponObj && typeof couponObj.percent_off === 'number' ? couponObj.percent_off : null,
        amountOff: couponObj && typeof couponObj.amount_off === 'number' ? couponObj.amount_off : null,
        couponDuration,
        duration: couponDuration,
        couponDurationInMonths,
        durationInMonths: couponDurationInMonths,
        verificationReference,
        verifiedAt: nowMs,
        expiresAt,
      },
      corsHeaders,
    );
  } catch (err: any) {
    return jsonResponse(
      502,
      {
        verified: false,
        verificationStatus: 'unavailable',
        couponState: 'verification_unavailable',
        code: err?.code || 'STRIPE_PREVIEW_UNAVAILABLE',
        error: 'Unable to verify checkout pricing with Stripe right now. Please try again.',
      },
      corsHeaders,
    );
  }
}

/**
 * Endpoint B: POST /api/checkout/create-subscription
 */
export async function handleCreateVerifiedSubscriptionRequest(
  request: Request,
  options: CheckoutBackendOptions,
): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, options.env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowFn ? options.nowFn() : Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const correlationId =
    request.headers.get('X-Correlation-Id') || `vchk_srv_${nowMs.toString(36)}_${generateNonce().slice(0, 8)}`;

  const stripeSecret = (options.env.STRIPE_SECRET_KEY || '').trim();
  const verificationSecret = (
    options.env.STRIPE_CHECKOUT_VERIFICATION_SECRET ||
    options.env.STRIPE_SECRET_KEY ||
    ''
  ).trim();

  if (!stripeSecret || !verificationSecret) {
    return jsonResponse(
      503,
      {
        aborted: true,
        blocked: true,
        code: 'BACKEND_NOT_CONFIGURED',
        error: 'Verified checkout service is not configured.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  const directusUrl = resolveSafeDirectusUrl(options.env.DIRECTUS_URL);
  const authResult = await authenticateDirectusUser(request, directusUrl, fetchImpl);
  if (!authResult.ok) {
    return jsonResponse(
      authResult.status,
      {
        aborted: true,
        blocked: true,
        code: authResult.code,
        error: authResult.message,
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  const authUser = authResult.user;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      400,
      {
        aborted: true,
        blocked: true,
        code: 'INVALID_JSON_BODY',
        error: 'Invalid subscription creation request payload.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  const verificationReference =
    typeof body?.verificationReference === 'string' ? body.verificationReference.trim() : '';
  const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : '';
  const promotionCodeId =
    typeof (body?.promotionCodeId ?? body?.promoCodeId) === 'string' &&
    String(body?.promotionCodeId ?? body?.promoCodeId).trim().length > 0
      ? String(body?.promotionCodeId ?? body?.promoCodeId).trim()
      : null;
  const approvedAmountDue =
    typeof body?.approvedAmountDue === 'number' && Number.isFinite(body.approvedAmountDue)
      ? body.approvedAmountDue
      : null;
  const approvedCurrency =
    typeof body?.approvedCurrency === 'string' && body.approvedCurrency.trim()
      ? body.approvedCurrency.trim().toLowerCase()
      : '';
  const paymentMethodId =
    typeof body?.paymentMethodId === 'string' && body.paymentMethodId.trim()
      ? body.paymentMethodId.trim()
      : null;
  const clientIdempotencyKey =
    typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : null;

  emitAudit(options, 'subscription_creation_attempted', correlationId, {
    userId: authUser.id,
    priceId,
    promotionCodeId,
    approvedAmountDue,
    approvedCurrency,
    hasPaymentMethodId: Boolean(paymentMethodId),
  });

  if (!verificationReference || !priceId || approvedAmountDue === null || approvedAmountDue < 0 || !approvedCurrency) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'MISSING_VERIFICATION_FIELDS',
    });
    return jsonResponse(
      400,
      {
        aborted: true,
        blocked: true,
        code: 'MISSING_VERIFICATION_FIELDS',
        error: 'Verified checkout reference and approved amount are required before creating a subscription.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  // 1. Verify cryptographic signature & expiration of verificationReference
  const verifiedRef = await verifySignedVerificationReference(
    verificationReference,
    verificationSecret,
    nowMs,
  );
  if (!verifiedRef.valid) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: verifiedRef.code,
    });
    return jsonResponse(
      409,
      {
        aborted: true,
        blocked: true,
        code: verifiedRef.code,
        error: verifiedRef.message,
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  const refPayload = verifiedRef.payload;

  // 2. Verify exact binding to authenticated user, price, promotion, currency, and approved amount
  const requestedEmail =
    typeof body?.email === 'string' && body.email.trim()
      ? body.email.trim().toLowerCase()
      : authUser.email;

  if (
    refPayload.userId !== authUser.id ||
    refPayload.email !== authUser.email ||
    requestedEmail !== authUser.email
  ) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'CUSTOMER_MISMATCH',
    });
    return jsonResponse(
      403,
      {
        aborted: true,
        blocked: true,
        code: 'CUSTOMER_MISMATCH',
        error: 'Checkout verification reference belongs to a different user account.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  if (refPayload.priceId !== priceId) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'PRICE_CHANGED_AFTER_APPROVAL',
      approvedPriceId: refPayload.priceId,
      requestedPriceId: priceId,
    });
    return jsonResponse(
      409,
      {
        aborted: true,
        blocked: true,
        code: 'PRICE_CHANGED_AFTER_APPROVAL',
        error: 'Selected subscription plan changed after price verification. Please review the updated total.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  if ((refPayload.promotionCodeId || null) !== (promotionCodeId || null)) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'PROMOTION_CHANGED_AFTER_APPROVAL',
      approvedPromotionCodeId: refPayload.promotionCodeId,
      requestedPromotionCodeId: promotionCodeId,
    });
    return jsonResponse(
      409,
      {
        aborted: true,
        blocked: true,
        code: 'PROMOTION_CHANGED_AFTER_APPROVAL',
        error: 'Promotion code changed after price verification. Please re-verify your total.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  if (refPayload.currency.toLowerCase() !== approvedCurrency.toLowerCase()) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'CURRENCY_MISMATCH',
      approvedCurrency: refPayload.currency,
      requestedCurrency: approvedCurrency,
    });
    return jsonResponse(
      409,
      {
        aborted: true,
        blocked: true,
        code: 'CURRENCY_MISMATCH',
        error: 'Billing currency does not match the verified checkout preview.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  if (refPayload.amountDueToday !== approvedAmountDue) {
    emitAudit(options, 'amount_mismatch_blocked', correlationId, {
      userId: authUser.id,
      reason: 'AMOUNT_CHANGED_AFTER_APPROVAL',
      signedAmountDue: refPayload.amountDueToday,
      requestedApprovedAmountDue: approvedAmountDue,
    });
    return jsonResponse(
      409,
      {
        aborted: true,
        blocked: true,
        code: 'AMOUNT_CHANGED_AFTER_APPROVAL',
        error: 'Approved checkout amount does not match the verified preview total.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  if (paymentMethodId && !PAYMENT_METHOD_ID_PATTERN.test(paymentMethodId)) {
    return jsonResponse(
      400,
      {
        aborted: true,
        blocked: true,
        code: 'INVALID_PAYMENT_METHOD_ID',
        error: 'Invalid saved payment method identifier.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }

  // 3. Enforce Duplicate Checkout & Replay Protection (In-Isolate + Cross-Isolate Stripe Coordination)
  const store = options.idempotencyStore ?? globalIdempotencyStore;
  const lockKey = `vref:${refPayload.nonce}`;
  const idemKey = clientIdempotencyKey ? `idem:${clientIdempotencyKey}` : null;
  const STALE_IN_FLIGHT_LOCK_MS = 60_000;

  const existingLock = store.get(lockKey) ?? (idemKey ? store.get(idemKey) : undefined);
  if (existingLock) {
    const isStaleInFlight =
      existingLock.status === 'in_flight' && nowMs - existingLock.createdAt > STALE_IN_FLIGHT_LOCK_MS;
    if (!isStaleInFlight) {
      emitAudit(options, 'amount_mismatch_blocked', correlationId, {
        userId: authUser.id,
        reason: 'DUPLICATE_CHECKOUT_SUBMISSION',
        existingStatus: existingLock.status,
      });
      return jsonResponse(
        409,
        {
          aborted: true,
          blocked: true,
          code: 'DUPLICATE_CHECKOUT_SUBMISSION',
          error: 'This checkout submission is already being processed or has already been completed.',
          subscriptionId: existingLock.subscriptionId ?? null,
          clientSecret: null,
        },
        corsHeaders,
      );
    }
    store.delete(lockKey);
    if (idemKey) {
      store.delete(idemKey);
    }
  }

  const lockEntry: IdempotencyEntry = {
    status: 'in_flight',
    createdAt: nowMs,
    userId: authUser.id,
  };
  store.set(lockKey, lockEntry);
  if (idemKey) {
    store.set(idemKey, lockEntry);
  }

  const releaseLockOnFailure = () => {
    store.delete(lockKey);
    if (idemKey) {
      store.delete(idemKey);
    }
  };

  const stripe = createStripeClient(stripeSecret, fetchImpl);
  let newlyCreatedSubscriptionId: string | null = null;
  const preexistingSubscriptionIds = new Set<string>();

  try {
    // 4. Resolve or create Stripe Customer
    const customerLookup = await resolveStripeCustomerByEmail(stripe, authUser.email, authUser.id);
    if (!customerLookup.ok) {
      releaseLockOnFailure();
      return jsonResponse(
        customerLookup.status,
        {
          aborted: true,
          blocked: true,
          code: customerLookup.code,
          error: customerLookup.message,
          clientSecret: null,
        },
        corsHeaders,
      );
    }

    let customer = customerLookup.customer;
    if (refPayload.customerId && (!customer || customer.id !== refPayload.customerId)) {
      releaseLockOnFailure();
      emitAudit(options, 'amount_mismatch_blocked', correlationId, {
        userId: authUser.id,
        reason: 'CUSTOMER_MISMATCH',
      });
      return jsonResponse(
        409,
        {
          aborted: true,
          blocked: true,
          code: 'CUSTOMER_MISMATCH',
          error: 'Stripe customer record changed since checkout preview.',
          clientSecret: null,
        },
        corsHeaders,
      );
    }

    // Cross-isolate subscription state inspection:
    // - Never create a duplicate active subscription
    // - Never cancel or modify any preexisting subscription
    // - Detect existing incomplete subscriptions created by this exact checkout (retries across Worker instances)
    let existingSameCheckoutIncompleteSub: any | null = null;

    if (customer && customer.id) {
      const existingSubs = await stripe.request('subscriptions', 'GET', {
        customer: customer.id,
        status: 'all',
        limit: '10',
        'expand[]': [
          'data.latest_invoice.payment_intent',
          'data.latest_invoice.discounts',
          'data.pending_setup_intent',
          'data.discounts',
        ],
      });
      const subList: any[] = Array.isArray(existingSubs?.data) ? existingSubs.data : [];

      for (const s of subList) {
        if (!s || typeof s.id !== 'string') continue;
        const subNonce =
          typeof s.metadata?.verification_nonce === 'string'
            ? s.metadata.verification_nonce.trim()
            : null;
        const subIdemKey =
          typeof s.metadata?.idempotency_key === 'string'
            ? s.metadata.idempotency_key.trim()
            : null;
        const subUserId =
          typeof s.metadata?.vamo_user_id === 'string' ? s.metadata.vamo_user_id.trim() : null;

        const isSameCheckout =
          (subNonce === refPayload.nonce ||
            (Boolean(clientIdempotencyKey) && subIdemKey === clientIdempotencyKey)) &&
          (!subUserId || subUserId === authUser.id);

        if (!isSameCheckout) {
          preexistingSubscriptionIds.add(s.id);
          if (['active', 'trialing', 'past_due', 'unpaid'].includes(s.status)) {
            releaseLockOnFailure();
            return jsonResponse(
              409,
              {
                aborted: true,
                blocked: true,
                code: 'EXISTING_ACTIVE_SUBSCRIPTION',
                error: 'Your account already has an active subscription. Use Change Plan to switch tiers.',
                clientSecret: null,
              },
              corsHeaders,
            );
          }
        } else {
          // Subscription was created by this exact checkout nonce
          if (s.status === 'active' || s.status === 'trialing') {
            lockEntry.status = 'completed';
            lockEntry.subscriptionId = s.id;
            emitAudit(options, 'amount_mismatch_blocked', correlationId, {
              userId: authUser.id,
              subscriptionId: s.id,
              reason: 'DUPLICATE_CHECKOUT_SUBMISSION',
              existingStatus: s.status,
            });
            return jsonResponse(
              409,
              {
                aborted: true,
                blocked: true,
                code: 'DUPLICATE_CHECKOUT_SUBMISSION',
                error: 'This checkout submission has already been completed.',
                subscriptionId: s.id,
                clientSecret: null,
              },
              corsHeaders,
            );
          }
          if (s.status === 'incomplete' && !existingSameCheckoutIncompleteSub) {
            existingSameCheckoutIncompleteSub = s;
          }
        }
      }
    }

    // Verify saved paymentMethodId belongs to this customer before using it
    if (paymentMethodId) {
      if (!customer || !customer.id) {
        releaseLockOnFailure();
        return jsonResponse(
          403,
          {
            aborted: true,
            blocked: true,
            code: 'PAYMENT_METHOD_OWNERSHIP_MISMATCH',
            error: 'Saved payment method does not belong to this customer.',
            clientSecret: null,
          },
          corsHeaders,
        );
      }
      const pm = await stripe.request(`payment_methods/${encodeURIComponent(paymentMethodId)}`, 'GET');
      const pmCustomer = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
      if (!pm || pmCustomer !== customer.id) {
        releaseLockOnFailure();
        return jsonResponse(
          403,
          {
            aborted: true,
            blocked: true,
            code: 'PAYMENT_METHOD_OWNERSHIP_MISMATCH',
            error: 'Selected payment method does not belong to your account.',
            clientSecret: null,
          },
          corsHeaders,
        );
      }
    }

    // 5. Re-verify price & promotion eligibility immediately before subscription creation
    const price = await stripe.request(`prices/${encodeURIComponent(priceId)}`, 'GET', {
      'expand[]': ['product'],
    });
    const productObj = price?.product && typeof price.product === 'object' ? price.product : null;
    const productId =
      typeof price?.product === 'string'
        ? price.product
        : typeof productObj?.id === 'string'
          ? productObj.id
          : '';
    if (
      !price ||
      price.active !== true ||
      typeof price.unit_amount !== 'number' ||
      !productId ||
      (productObj && productObj.active === false)
    ) {
      releaseLockOnFailure();
      return jsonResponse(
        422,
        {
          aborted: true,
          blocked: true,
          code: 'PRICE_INACTIVE_OR_INVALID',
          error: 'Selected subscription price is no longer active.',
          clientSecret: null,
        },
        corsHeaders,
      );
    }

    let validatedCouponId: string | null = null;
    let validatedCouponPercentOff: number | null = null;
    if (promotionCodeId) {
      const promoCheck = await validatePromotionEligibility({
        stripe,
        promotionCodeId,
        productId,
        originalPrice: Number(price.unit_amount),
        currency: approvedCurrency,
        customer,
        nowSec,
      });
      if (!promoCheck.eligible) {
        releaseLockOnFailure();
        emitAudit(options, 'amount_mismatch_blocked', correlationId, {
          userId: authUser.id,
          reason: promoCheck.reasonCode || 'PROMOTION_NO_LONGER_ELIGIBLE',
          promotionCodeId,
        });
        return jsonResponse(
          409,
          {
            aborted: true,
            blocked: true,
            code: promoCheck.reasonCode || 'PROMOTION_NO_LONGER_ELIGIBLE',
            error: promoCheck.message || 'Promotion code is no longer valid. Please re-verify your total.',
            clientSecret: null,
          },
          corsHeaders,
        );
      }
      validatedCouponId = promoCheck.couponObj?.id ?? null;
      validatedCouponPercentOff =
        typeof promoCheck.couponObj?.percent_off === 'number'
          ? promoCheck.couponObj.percent_off
          : null;
    }

    // Create Stripe customer if none existed yet (preserving canonical VAMO email & name linkage)
    if (!customer) {
      const customerName =
        (typeof body?.name === 'string' && body.name.trim()) || authUser.fullName || authUser.email;
      customer = await stripe.request(
        'customers',
        'POST',
        {
          email: authUser.email,
          name: customerName,
          'metadata[vamo_user_id]': authUser.id,
          ...(authUser.providerId ? { 'metadata[vamo_provider_id]': authUser.providerId } : {}),
          'metadata[source]': 'vamo-business-portal',
        },
        `cust_create_${authUser.id}`,
      );
    }

    // 6. Create or Reuse Incomplete Stripe Subscription with payment_behavior=default_incomplete
    // CRITICAL PRE-CHARGE SAFETY:
    // Never pass `default_payment_method` during `POST /v1/subscriptions`.
    // Payment authorization/collection must only happen AFTER the server verifies `latest_invoice`.
    const stripeIdempotencyKey = `sub_create_${authUser.id}_${refPayload.nonce}`;
    let sub: any = null;
    let reusedExistingIncompleteSubscription = false;

    if (existingSameCheckoutIncompleteSub) {
      reusedExistingIncompleteSubscription = true;
      if (
        existingSameCheckoutIncompleteSub.latest_invoice &&
        typeof existingSameCheckoutIncompleteSub.latest_invoice === 'object'
      ) {
        sub = existingSameCheckoutIncompleteSub;
      } else {
        sub = await stripe.request(
          `subscriptions/${encodeURIComponent(existingSameCheckoutIncompleteSub.id)}`,
          'GET',
          {
            'expand[]': [
              'latest_invoice.payment_intent',
              'latest_invoice.discounts',
              'pending_setup_intent',
              'discounts',
            ],
          },
        );
      }
    } else {
      const subParams: Record<string, string | string[]> = {
        customer: customer.id,
        'items[0][price]': priceId,
        payment_behavior: 'default_incomplete',
        'payment_settings[save_default_payment_method]': 'on_subscription',
        'metadata[vamo_user_id]': authUser.id,
        ...(authUser.providerId ? { 'metadata[vamo_provider_id]': authUser.providerId } : {}),
        'metadata[source]': 'vamo-business-portal',
        'metadata[approved_amount_due]': String(approvedAmountDue),
        'metadata[approved_currency]': approvedCurrency,
        'metadata[verification_nonce]': refPayload.nonce,
        'metadata[idempotency_key]': clientIdempotencyKey || stripeIdempotencyKey,
        'expand[]': [
          'latest_invoice.payment_intent',
          'latest_invoice.discounts',
          'pending_setup_intent',
          'discounts',
        ],
      };

      if (promotionCodeId) {
        subParams['discounts[0][promotion_code]'] = promotionCodeId;
      }

      try {
        sub = await stripe.request('subscriptions', 'POST', subParams, stripeIdempotencyKey);
      } catch (subErr: any) {
        if (
          subErr?.status === 409 ||
          subErr?.code === 'idempotency_key_in_use' ||
          subErr?.code === 'lock_timeout'
        ) {
          releaseLockOnFailure();
          emitAudit(options, 'amount_mismatch_blocked', correlationId, {
            userId: authUser.id,
            reason: 'DUPLICATE_CHECKOUT_SUBMISSION',
            stripeCode: subErr?.code,
          });
          return jsonResponse(
            409,
            {
              aborted: true,
              blocked: true,
              retryable: true,
              code: 'DUPLICATE_CHECKOUT_SUBMISSION',
              error: 'This checkout submission is currently being processed. Please wait a moment.',
              clientSecret: null,
            },
            corsHeaders,
          );
        }
        throw subErr;
      }
    }

    newlyCreatedSubscriptionId = typeof sub?.id === 'string' ? sub.id : null;

    if (!newlyCreatedSubscriptionId) {
      releaseLockOnFailure();
      return jsonResponse(
        502,
        {
          aborted: true,
          blocked: true,
          code: 'SUBSCRIPTION_CREATION_FAILED',
          error: 'Stripe did not return a valid subscription identifier.',
          clientSecret: null,
        },
        corsHeaders,
      );
    }

    // 7. Server-Side Pre-Charge Hard Stop: Inspect latest_invoice before returning any clientSecret
    const latestInvoice =
      sub?.latest_invoice && typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
    const invoiceId = typeof latestInvoice?.id === 'string' ? latestInvoice.id : null;
    const invoiceAmountDue =
      typeof latestInvoice?.amount_due === 'number' && Number.isFinite(latestInvoice.amount_due)
        ? latestInvoice.amount_due
        : null;
    const invoiceAmountPaid =
      typeof latestInvoice?.amount_paid === 'number' && Number.isFinite(latestInvoice.amount_paid)
        ? latestInvoice.amount_paid
        : 0;
    const invoiceSubtotal =
      typeof latestInvoice?.subtotal === 'number' && Number.isFinite(latestInvoice.subtotal)
        ? latestInvoice.subtotal
        : refPayload.subtotal;
    const invoiceTax =
      typeof latestInvoice?.tax === 'number' && Number.isFinite(latestInvoice.tax)
        ? latestInvoice.tax
        : 0;
    const invoiceCurrency =
      typeof latestInvoice?.currency === 'string' && latestInvoice.currency.trim()
        ? latestInvoice.currency.trim().toLowerCase()
        : '';
    const invoiceDiscountAmount = sumInvoiceDiscounts(latestInvoice);

    const paymentIntent =
      latestInvoice?.payment_intent && typeof latestInvoice.payment_intent === 'object'
        ? latestInvoice.payment_intent
        : null;
    const paymentIntentAmount =
      paymentIntent && typeof paymentIntent.amount === 'number' && Number.isFinite(paymentIntent.amount)
        ? paymentIntent.amount
        : null;
    const pendingSetupIntent =
      sub?.pending_setup_intent && typeof sub.pending_setup_intent === 'object'
        ? sub.pending_setup_intent
        : null;

    const discountApplied = promotionCodeId
      ? isPromotionPresentOnSubscriptionOrInvoice(
          sub,
          latestInvoice,
          promotionCodeId,
          validatedCouponId,
        ) && (invoiceDiscountAmount > 0 || invoiceAmountDue === 0)
      : false;

    const hasChargeableIntentForZeroApproval =
      approvedAmountDue === 0 &&
      ((invoiceAmountDue !== null && invoiceAmountDue > 0) ||
        (paymentIntentAmount !== null && paymentIntentAmount > 0) ||
        (paymentIntent &&
          typeof paymentIntent.client_secret === 'string' &&
          paymentIntent.client_secret.startsWith('pi_')));

    const unexpectedHundredPercentAmount =
      validatedCouponPercentOff === 100 &&
      invoiceAmountDue !== null &&
      invoiceAmountDue > invoiceTax;

    const prematureChargeOccurred =
      (invoiceAmountDue !== null && invoiceAmountDue > 0 && latestInvoice?.status === 'paid') ||
      invoiceAmountPaid > 0 ||
      (paymentIntent &&
        typeof paymentIntent.status === 'string' &&
        ['succeeded', 'processing', 'requires_capture'].includes(paymentIntent.status));

    let blockCode: string | null = null;
    let blockMessage: string | null = null;

    if (invoiceAmountDue === null) {
      blockCode = 'UNVERIFIED_FIRST_INVOICE_AMOUNT';
      blockMessage =
        'Subscription was created without a verifiable first invoice amount and was canceled before charging.';
    } else if (invoiceCurrency !== approvedCurrency.toLowerCase()) {
      blockCode = 'CURRENCY_MISMATCH';
      blockMessage = 'First invoice currency did not match the customer-approved currency.';
    } else if (hasChargeableIntentForZeroApproval) {
      blockCode = 'ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED';
      blockMessage =
        'Customer approved $0.00 due today, but Stripe generated a payable invoice or PaymentIntent. Subscription was canceled before any charge could occur.';
    } else if (unexpectedHundredPercentAmount) {
      blockCode = 'PROMOTION_NOT_APPLIED_ON_INVOICE';
      blockMessage =
        'Approved 100% promotion code did not produce a $0.00 invoice total. Subscription was canceled before charging.';
    } else if (
      invoiceAmountDue > approvedAmountDue ||
      (paymentIntentAmount !== null && paymentIntentAmount > approvedAmountDue)
    ) {
      blockCode = 'AMOUNT_EXCEEDS_APPROVED';
      blockMessage = `First invoice amount (${paymentIntentAmount ?? invoiceAmountDue}) exceeded the customer-approved amount (${approvedAmountDue}). Subscription was canceled before charging.`;
    } else if (promotionCodeId && !discountApplied) {
      blockCode = 'PROMOTION_NOT_APPLIED_ON_INVOICE';
      blockMessage =
        'Approved promotion code was not applied to the first invoice. Subscription was canceled before charging.';
    } else if (prematureChargeOccurred) {
      blockCode = 'UNEXPECTED_PRE_VERIFICATION_CHARGE';
      blockMessage =
        'Stripe attempted to collect payment before server-side invoice verification completed. Subscription was canceled and any premature charge was reversed.';
    }

    if (blockCode) {
      // If Stripe abnormally collected payment during subscription creation, immediately refund it
      if (prematureChargeOccurred && paymentIntent && typeof paymentIntent.id === 'string') {
        try {
          await stripe.request(
            'refunds',
            'POST',
            {
              payment_intent: paymentIntent.id,
              reason: 'duplicate',
            },
            `refund_abort_${newlyCreatedSubscriptionId}`,
          );
        } catch {
          // Best-effort automatic refund on premature charge
        }
      }

      // Cancel ONLY the newly created (or same-checkout incomplete) subscription, NEVER a preexisting subscription
      if (!preexistingSubscriptionIds.has(newlyCreatedSubscriptionId)) {
        try {
          await stripe.request(
            `subscriptions/${encodeURIComponent(newlyCreatedSubscriptionId)}`,
            'DELETE',
          );
        } catch {
          // Best-effort cleanup of incomplete subscription
        }
      }

      emitAudit(options, 'amount_mismatch_blocked', correlationId, {
        userId: authUser.id,
        subscriptionId: newlyCreatedSubscriptionId,
        invoiceId,
        approvedAmountDue,
        invoiceAmountDue,
        invoiceDiscountAmount,
        promotionCodeId,
        discountApplied,
        prematureChargeOccurred,
        reason: blockCode,
      });

      releaseLockOnFailure();

      return jsonResponse(
        409,
        {
          aborted: true,
          blocked: true,
          code: blockCode,
          error: blockMessage,
          subscriptionId: newlyCreatedSubscriptionId,
          clientSecret: null,
          requiresSetup: false,
          invoiceId,
          invoiceAmountDue,
          invoiceSubtotal,
          invoiceDiscountAmount,
          invoiceTax,
          invoiceCurrency: invoiceCurrency || approvedCurrency,
          appliedPromotionCodeId: null,
          discountApplied: false,
          verificationReference,
        },
        corsHeaders,
      );
    }

    // 8. Determine safe clientSecret (never return a PaymentIntent secret for $0.00 approved checkouts)
    let clientSecret: string | null = null;
    let requiresSetup = false;

    if (approvedAmountDue === 0) {
      if (
        pendingSetupIntent &&
        typeof pendingSetupIntent.client_secret === 'string' &&
        pendingSetupIntent.client_secret.startsWith('seti_')
      ) {
        clientSecret = pendingSetupIntent.client_secret;
        requiresSetup = true;
      } else {
        clientSecret = null;
        requiresSetup = false;
        // Post-verification saved card attachment for $0.00 subscriptions without a SetupIntent
        if (paymentMethodId) {
          try {
            await stripe.request(
              `subscriptions/${encodeURIComponent(newlyCreatedSubscriptionId)}`,
              'POST',
              {
                default_payment_method: paymentMethodId,
              },
              `sub_set_pm_${authUser.id}_${refPayload.nonce}`,
            );
          } catch {
            // Non-fatal: subscription is already verified at $0.00
          }
        }
      }
    } else if (
      paymentIntent &&
      typeof paymentIntent.client_secret === 'string' &&
      paymentIntent.client_secret.startsWith('pi_')
    ) {
      clientSecret = paymentIntent.client_secret;
      requiresSetup = false;
    } else {
      // Payable subscription ($ > 0) is missing a valid PaymentIntent clientSecret -> fail closed
      if (!preexistingSubscriptionIds.has(newlyCreatedSubscriptionId)) {
        try {
          await stripe.request(
            `subscriptions/${encodeURIComponent(newlyCreatedSubscriptionId)}`,
            'DELETE',
          );
        } catch {
          // Best-effort cleanup
        }
      }
      releaseLockOnFailure();
      return jsonResponse(
        502,
        {
          aborted: true,
          blocked: true,
          code: 'MISSING_PAYMENT_INTENT_SECRET',
          error: 'Stripe did not return a valid payment confirmation secret for the verified invoice.',
          clientSecret: null,
        },
        corsHeaders,
      );
    }

    lockEntry.status = 'completed';
    lockEntry.subscriptionId = newlyCreatedSubscriptionId;

    emitAudit(options, 'first_invoice_verified', correlationId, {
      userId: authUser.id,
      customerId: customer.id,
      subscriptionId: newlyCreatedSubscriptionId,
      invoiceId,
      approvedAmountDue,
      invoiceAmountDue,
      invoiceSubtotal,
      invoiceDiscountAmount,
      invoiceTax,
      invoiceCurrency,
      appliedPromotionCodeId: promotionCodeId,
      discountApplied,
      requiresSetup,
      reusedExistingIncompleteSubscription,
    });

    return jsonResponse(
      200,
      {
        aborted: false,
        blocked: false,
        verifiedByServer: true,
        reusedExistingIncompleteSubscription,
        subscriptionId: newlyCreatedSubscriptionId,
        customerId: customer.id,
        status: sub.status || 'incomplete',
        clientSecret,
        requiresSetup,
        invoiceId,
        invoiceAmountDue,
        invoiceSubtotal,
        invoiceDiscountAmount,
        invoiceTax,
        invoiceCurrency,
        appliedPromotionCodeId: promotionCodeId,
        discountApplied,
        verificationReference,
      },
      corsHeaders,
    );
  } catch (err: any) {
    releaseLockOnFailure();
    return jsonResponse(
      502,
      {
        aborted: true,
        blocked: true,
        code: err?.code || 'SUBSCRIPTION_CREATION_FAILED',
        error: err?.message || 'Could not create verified subscription at this time.',
        clientSecret: null,
      },
      corsHeaders,
    );
  }
}

/**
 * Unified request router for `/api/checkout/*` endpoints.
 * Works identically in Cloudflare Workers (`worker.ts`) and standalone Node/Railway servers.
 */
export async function handleCheckoutApiRequest(
  request: Request,
  options: CheckoutBackendOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path !== '/api/checkout/preview' && path !== '/api/checkout/create-subscription') {
    return null;
  }

  const corsHeaders = buildCorsHeaders(request, options.env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      405,
      {
        error: 'Method not allowed. Use POST.',
        code: 'METHOD_NOT_ALLOWED',
      },
      corsHeaders,
    );
  }

  if (path === '/api/checkout/preview') {
    return handleCheckoutPreviewRequest(request, options);
  }

  return handleCreateVerifiedSubscriptionRequest(request, options);
}
