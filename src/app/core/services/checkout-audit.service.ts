import { Injectable } from '@angular/core';

export type CheckoutAuditEventType =
  | 'promotion_submitted'
  | 'promotion_validation_succeeded'
  | 'promotion_validation_failed'
  | 'invoice_preview_created'
  | 'amount_displayed_for_approval'
  | 'subscription_creation_attempted'
  | 'first_invoice_verified'
  | 'amount_mismatch_blocked'
  | 'setup_intent_confirmed'
  | 'subscription_created_from_setup'
  | 'subscription_status_verified'
  | 'checkout_failed'
  | 'payment_succeeded'
  | 'payment_failed';

export interface CheckoutAuditEntry {
  event: CheckoutAuditEventType;
  timestamp: string;
  correlationId: string;
  customerRef?: string | null;
  businessRef?: string | null;
  priceId?: string | null;
  promotionCode?: string | null;
  promotionCodeId?: string | null;
  verificationReference?: string | null;
  subscriptionId?: string | null;
  setupIntentId?: string | null;
  paymentIntentId?: string | null;
  invoiceId?: string | null;
  currency?: string | null;
  approvedAmount?: number | null;
  actualAmount?: number | null;
  discountAmount?: number | null;
  errorCode?: string | null;
  reason?: string | null;
}

const FORBIDDEN_KEYS = new Set([
  'clientsecret',
  'client_secret',
  'cardnumber',
  'card_number',
  'cvc',
  'cvv',
  'expmonth',
  'exp_month',
  'expyear',
  'exp_year',
  'email',
  'customeremail',
  'customer_email',
  'customername',
  'customer_name',
  'password',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
]);

export function sanitizeAuditString(value: string | null | undefined): string | null {
  if (value == null) return null;
  let cleaned = String(value);
  // Strip Stripe client secrets (pi_..._secret_... or seti_..._secret_...)
  cleaned = cleaned.replace(/\b((?:pi|seti)_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+\b/g, '$1_[REDACTED_SECRET]');
  // Strip Stripe API keys
  cleaned = cleaned.replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g, '[REDACTED_STRIPE_KEY]');
  // Strip Bearer tokens
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
  // Strip email addresses
  cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');
  // Strip 13-19 digit PAN-like sequences
  cleaned = cleaned.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]');
  // Strip card expiry MM/YY or MM/YYYY patterns
  cleaned = cleaned.replace(/\b(?:0[1-9]|1[0-2])\s*\/\s*(?:\d{2}|\d{4})\b/g, '[REDACTED_EXPIRY]');
  return cleaned;
}

@Injectable({ providedIn: 'root' })
export class CheckoutAuditService {
  private readonly maxEntries = 200;
  private readonly entries: CheckoutAuditEntry[] = [];
  private activeCorrelationId: string = this.generateCorrelationId();

  generateCorrelationId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `chk_${crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `chk_${Date.now().toString(36)}_${rand}`;
  }

  startNewCorrelation(): string {
    this.activeCorrelationId = this.generateCorrelationId();
    return this.activeCorrelationId;
  }

  getCorrelationId(): string {
    return this.activeCorrelationId;
  }

  record(
    event: CheckoutAuditEventType,
    payload: Omit<Partial<CheckoutAuditEntry>, 'event' | 'timestamp'> = {},
  ): CheckoutAuditEntry {
    const sanitizedPayload: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(payload)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        continue;
      }
      if (typeof rawValue === 'string') {
        sanitizedPayload[key] = sanitizeAuditString(rawValue);
      } else {
        sanitizedPayload[key] = rawValue;
      }
    }

    const entry: CheckoutAuditEntry = {
      event,
      timestamp: new Date().toISOString(),
      correlationId:
        (typeof sanitizedPayload['correlationId'] === 'string' && sanitizedPayload['correlationId']) ||
        this.activeCorrelationId,
      customerRef: (sanitizedPayload['customerRef'] as string | null | undefined) ?? null,
      businessRef: (sanitizedPayload['businessRef'] as string | null | undefined) ?? null,
      priceId: (sanitizedPayload['priceId'] as string | null | undefined) ?? null,
      promotionCode: (sanitizedPayload['promotionCode'] as string | null | undefined) ?? null,
      promotionCodeId: (sanitizedPayload['promotionCodeId'] as string | null | undefined) ?? null,
      verificationReference: (sanitizedPayload['verificationReference'] as string | null | undefined) ?? null,
      subscriptionId: (sanitizedPayload['subscriptionId'] as string | null | undefined) ?? null,
      setupIntentId: (sanitizedPayload['setupIntentId'] as string | null | undefined) ?? null,
      paymentIntentId: (sanitizedPayload['paymentIntentId'] as string | null | undefined) ?? null,
      invoiceId: (sanitizedPayload['invoiceId'] as string | null | undefined) ?? null,
      currency:
        typeof sanitizedPayload['currency'] === 'string'
          ? sanitizedPayload['currency'].toLowerCase()
          : null,
      approvedAmount:
        typeof sanitizedPayload['approvedAmount'] === 'number' && Number.isFinite(sanitizedPayload['approvedAmount'])
          ? sanitizedPayload['approvedAmount']
          : null,
      actualAmount:
        typeof sanitizedPayload['actualAmount'] === 'number' && Number.isFinite(sanitizedPayload['actualAmount'])
          ? sanitizedPayload['actualAmount']
          : null,
      discountAmount:
        typeof sanitizedPayload['discountAmount'] === 'number' && Number.isFinite(sanitizedPayload['discountAmount'])
          ? sanitizedPayload['discountAmount']
          : null,
      errorCode: (sanitizedPayload['errorCode'] as string | null | undefined) ?? null,
      reason: (sanitizedPayload['reason'] as string | null | undefined) ?? null,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  getEntries(): readonly CheckoutAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
