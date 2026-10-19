import { describe, it, expect, beforeEach } from 'vitest';
import {
  CheckoutBackendAuditEvent,
  CheckoutBackendEnv,
  IdempotencyEntry,
  handleCheckoutApiRequest,
  isPromotionPresentOnSubscriptionOrInvoice,
  redactServerValue,
  signVerificationReference,
} from './verified-checkout-backend';
import worker from './worker';

describe('Isolated Verified Stripe Checkout Backend (src/server/verified-checkout-backend.ts)', () => {
  const testEnv: CheckoutBackendEnv = {
    STRIPE_SECRET_KEY: 'sk_test_51IsolatedSecretKeyDoNotLog999',
    STRIPE_CHECKOUT_VERIFICATION_SECRET: 'whsec_test_verification_hmac_secret_1234567890',
    DIRECTUS_URL: 'https://api.vamo-app.com',
    ALLOWED_ORIGINS: 'https://business.vamo-app.com,http://localhost:4200',
    VERIFICATION_TTL_MS: 600_000,
  };

  let auditEvents: CheckoutBackendAuditEvent[];
  let idempotencyStore: Map<string, IdempotencyEntry>;
  let currentNowMs: number;
  let stripeCalls: Array<{ url: string; method: string; body: string }>;

  const mockDirectusUser = {
    id: 'user-apple-admin-1',
    email: 'adminapple@admin.com',
    first_name: 'Admin',
    last_name: 'Apple',
    status: 'active',
    provider_link: {
      id: 'prov-apple-1',
      name: 'Apple Lounge Cabarete',
      subscription_tier: null,
    },
  };

  const mockBasicPrice = {
    id: 'price_basic_5900',
    active: true,
    unit_amount: 5900,
    currency: 'usd',
    recurring: { interval: 'month' },
    product: {
      id: 'prod_basic_tier',
      name: 'Basic Plan',
      active: true,
    },
  };

  const mockFoundersPromo = {
    id: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
    code: 'FOUNDERS90',
    active: true,
    expires_at: null,
    max_redemptions: null,
    times_redeemed: 2,
    customer: null,
    restrictions: {
      first_time_transaction: false,
      minimum_amount: null,
    },
    coupon: {
      id: 'coupon_founders_100',
      name: 'LT Founders club',
      valid: true,
      percent_off: 100,
      amount_off: null,
      duration: 'repeating',
      duration_in_months: 3,
      applies_to: null,
    },
  };

  beforeEach(() => {
    auditEvents = [];
    idempotencyStore = new Map<string, IdempotencyEntry>();
    currentNowMs = 1760880000000;
    stripeCalls = [];
  });

  function jsonRes(status: number, data: unknown): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function buildPostRequest(
    path: '/api/checkout/preview' | '/api/checkout/create-subscription',
    body: unknown,
    token = 'valid_directus_jwt_token_secret',
  ): Request {
    return new Request(`https://business.vamo-app.com${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://business.vamo-app.com',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('1. Valid 100% coupon -> verified $0.00 due today -> $0.00 subscription creation without chargeable PaymentIntent', async () => {
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      if (url.startsWith('https://api.stripe.com/')) {
        stripeCalls.push({ url, method, body });
      }

      if (url.startsWith('https://api.vamo-app.com/users/me')) {
        return jsonRes(200, { data: mockDirectusUser });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/price_basic_5900')) {
        return jsonRes(200, mockBasicPrice);
      }
      if (url.startsWith('https://api.stripe.com/v1/customers?email=')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes?')) {
        return jsonRes(200, { data: [mockFoundersPromo] });
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/promo_1UKiYz2aqrJCvAj3rpoKa3Kf')) {
        return jsonRes(200, mockFoundersPromo);
      }
      if (url === 'https://api.stripe.com/v1/invoices/create_preview' && method === 'POST') {
        return jsonRes(200, {
          subtotal: 5900,
          tax: 0,
          total: 0,
          amount_due: 0,
          currency: 'usd',
          total_discount_amounts: [{ amount: 5900 }],
          discounts: [{ promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf' }],
        });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_apple_1')) {
        return jsonRes(200, { data: [] });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(200, {
          id: 'sub_free_verified_1',
          status: 'active',
          discounts: [{ promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf' }],
          pending_setup_intent: {
            id: 'seti_free_card_setup_1',
            client_secret: 'seti_free_card_setup_1_secret_xyz',
          },
          latest_invoice: {
            id: 'in_free_1',
            subtotal: 5900,
            tax: 0,
            amount_due: 0,
            currency: 'usd',
            total_discount_amounts: [{ amount: 5900 }],
            discounts: [{ promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf' }],
            payment_intent: null,
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${method} ${url}`);
    };

    // Step A: Preview
    const previewRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      {
        env: testEnv,
        fetchImpl: mockFetch,
        nowFn: () => currentNowMs,
        onAuditEvent: (e) => auditEvents.push(e),
        idempotencyStore,
      },
    );

    expect(previewRes?.status).toBe(200);
    const previewBody = await previewRes!.json();
    expect(previewBody.verified).toBe(true);
    expect(previewBody.couponState).toBe('verified_applied');
    expect(previewBody.subtotal).toBe(5900);
    expect(previewBody.discountAmount).toBe(5900);
    expect(previewBody.amountDueToday).toBe(0);
    expect(previewBody.renewalAmount).toBe(5900);
    expect(previewBody.couponDuration).toBe('repeating');
    expect(previewBody.couponDurationInMonths).toBe(3);
    expect(previewBody.verificationReference).toMatch(/^vref_2_/);

    // Step B: Create Verified Subscription using the signed verificationReference
    const createRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: previewBody.verificationReference,
      }),
      {
        env: testEnv,
        fetchImpl: mockFetch,
        nowFn: () => currentNowMs + 5000,
        onAuditEvent: (e) => auditEvents.push(e),
        idempotencyStore,
      },
    );

    expect(createRes?.status).toBe(200);
    const createBody = await createRes!.json();
    expect(createBody.aborted).toBe(false);
    expect(createBody.verifiedByServer).toBe(true);
    expect(createBody.subscriptionId).toBe('sub_free_verified_1');
    expect(createBody.invoiceAmountDue).toBe(0);
    expect(createBody.invoiceDiscountAmount).toBe(5900);
    expect(createBody.requiresSetup).toBe(true);
    expect(createBody.clientSecret).toBe('seti_free_card_setup_1_secret_xyz');
    expect(createBody.appliedPromotionCodeId).toBe('promo_1UKiYz2aqrJCvAj3rpoKa3Kf');

    // Verify no Directus Flow was called
    expect(stripeCalls.some((c) => c.url.includes('/flows/trigger/'))).toBe(false);
  });

  it('2. Valid partial coupon -> verified discounted amount ($39.00) -> exact discounted charge', async () => {
    const partialPromo = {
      ...mockFoundersPromo,
      id: 'promo_save20',
      code: 'SAVE20',
      coupon: {
        id: 'coupon_save20',
        name: '$20 Off',
        valid: true,
        percent_off: null,
        amount_off: 2000,
        currency: 'usd',
        duration: 'once',
        duration_in_months: null,
        applies_to: null,
      },
    };

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) {
        return jsonRes(200, { data: mockDirectusUser });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/price_basic_5900')) {
        return jsonRes(200, mockBasicPrice);
      }
      if (url.startsWith('https://api.stripe.com/v1/customers?email=')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/promo_save20')) {
        return jsonRes(200, partialPromo);
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes')) {
        return jsonRes(200, { data: [partialPromo] });
      }
      if (url === 'https://api.stripe.com/v1/invoices/create_preview') {
        return jsonRes(200, {
          subtotal: 5900,
          tax: 0,
          total: 3900,
          amount_due: 3900,
          currency: 'usd',
          total_discount_amounts: [{ amount: 2000 }],
          discounts: [{ promotion_code: 'promo_save20' }],
        });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(200, {
          id: 'sub_partial_3900',
          status: 'incomplete',
          discounts: [{ promotion_code: 'promo_save20' }],
          latest_invoice: {
            id: 'in_partial_3900',
            subtotal: 5900,
            tax: 0,
            amount_due: 3900,
            currency: 'usd',
            total_discount_amounts: [{ amount: 2000 }],
            discounts: [{ promotion_code: 'promo_save20' }],
            payment_intent: {
              id: 'pi_3900',
              amount: 3900,
              client_secret: 'pi_3900_secret_discounted',
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const previewRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'SAVE20',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs, idempotencyStore },
    );
    const previewBody = await previewRes!.json();
    expect(previewBody.verified).toBe(true);
    expect(previewBody.amountDueToday).toBe(3900);
    expect(previewBody.discountAmount).toBe(2000);
    expect(previewBody.renewalAmount).toBe(5900);

    const createRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_save20',
        approvedAmountDue: 3900,
        approvedCurrency: 'usd',
        verificationReference: previewBody.verificationReference,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );
    const createBody = await createRes!.json();
    expect(createBody.aborted).toBe(false);
    expect(createBody.invoiceAmountDue).toBe(3900);
    expect(createBody.requiresSetup).toBe(false);
    expect(createBody.clientSecret).toBe('pi_3900_secret_discounted');
  });

  it('3. Expired coupon -> rejected with PROMOTION_EXPIRED and couponState: invalid_or_ineligible', async () => {
    const expiredPromo = {
      ...mockFoundersPromo,
      expires_at: Math.floor(currentNowMs / 1000) - 3600,
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/customers')) return jsonRes(200, { data: [] });
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes')) return jsonRes(200, { data: [expiredPromo] });
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );
    const body = await res!.json();
    expect(body.verified).toBe(false);
    expect(body.couponState).toBe('invalid_or_ineligible');
    expect(body.code).toBe('PROMOTION_EXPIRED');
  });

  it('4. Product-restricted coupon -> rejected with PROMOTION_PRODUCT_RESTRICTED when selected plan product is not in applies_to.products', async () => {
    const productRestrictedPromo = {
      ...mockFoundersPromo,
      coupon: {
        ...mockFoundersPromo.coupon,
        applies_to: {
          products: ['prod_starter_only'],
        },
      },
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/customers')) return jsonRes(200, { data: [] });
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes')) return jsonRes(200, { data: [productRestrictedPromo] });
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );
    const body = await res!.json();
    expect(body.verified).toBe(false);
    expect(body.couponState).toBe('invalid_or_ineligible');
    expect(body.code).toBe('PROMOTION_PRODUCT_RESTRICTED');
  });

  it('5. First-time-customer restriction -> rejected when customer has prior paid invoices or prior subscriptions', async () => {
    const firstTimePromo = {
      ...mockFoundersPromo,
      restrictions: {
        first_time_transaction: true,
        minimum_amount: null,
      },
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_returning_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes')) {
        return jsonRes(200, { data: [firstTimePromo] });
      }
      if (url.startsWith('https://api.stripe.com/v1/invoices?customer=cus_returning_1&status=paid')) {
        return jsonRes(200, { data: [{ id: 'in_old_paid_1', status: 'paid' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_returning_1')) {
        return jsonRes(200, { data: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );
    const body = await res!.json();
    expect(body.verified).toBe(false);
    expect(body.couponState).toBe('invalid_or_ineligible');
    expect(body.code).toBe('PROMOTION_FIRST_TIME_CUSTOMER_ONLY');
  });

  it('6. Coupon restricted to wrong customer -> rejected with PROMOTION_CUSTOMER_RESTRICTED', async () => {
    const wrongCustomerPromo = {
      ...mockFoundersPromo,
      customer: 'cus_vip_someone_else',
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes')) {
        return jsonRes(200, { data: [wrongCustomerPromo] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );
    const body = await res!.json();
    expect(body.verified).toBe(false);
    expect(body.couponState).toBe('invalid_or_ineligible');
    expect(body.code).toBe('PROMOTION_CUSTOMER_RESTRICTED');
  });

  it('7. Tampered verification reference -> rejected before subscription creation (zero Stripe calls)', async () => {
    const validRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 5900,
        tax: 0,
        amountDueToday: 0,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_tamper_test',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const tamperedRef = validRef.slice(0, -4) + 'ffff';

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      stripeCalls.push({ url, method: 'ANY', body: '' });
      throw new Error('Stripe should not be called when verificationReference is tampered');
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: tamperedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('TAMPERED_VERIFICATION_REFERENCE');
    expect(body.clientSecret).toBeNull();
    expect(stripeCalls.length).toBe(0);
  });

  it('8. Expired verification reference -> rejected before subscription creation (zero Stripe calls)', async () => {
    const expiredRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs - 700_000,
        expiresAt: currentNowMs - 100_000,
        nonce: 'nonce_expired_test',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      stripeCalls.push({ url, method: 'ANY', body: '' });
      throw new Error('Stripe should not be called when verificationReference is expired');
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: expiredRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('EXPIRED_VERIFICATION_REFERENCE');
    expect(body.clientSecret).toBeNull();
    expect(stripeCalls.length).toBe(0);
  });

  it('9. Amount changed after approval -> blocked before payment when client alters approvedAmountDue or Stripe returns higher invoice amount', async () => {
    const signedRefFor39 = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'SAVE20',
        promotionCodeId: 'promo_save20',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 2000,
        tax: 0,
        amountDueToday: 3900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_3900',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let canceledSubId: string | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/')) {
        return jsonRes(200, {
          ...mockFoundersPromo,
          id: 'promo_save20',
          coupon: { ...mockFoundersPromo.coupon, percent_off: null, amount_off: 2000, currency: 'usd' },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        // Simulate Stripe producing a $59.00 first invoice despite $39.00 approval
        return jsonRes(200, {
          id: 'sub_unexpected_5900',
          status: 'incomplete',
          latest_invoice: {
            id: 'in_unexpected_5900',
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            discounts: [],
            payment_intent: {
              id: 'pi_unexpected_5900',
              amount: 5900,
              client_secret: 'pi_unexpected_5900_secret_danger',
            },
          },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions/sub_unexpected_5900' && method === 'DELETE') {
        canceledSubId = 'sub_unexpected_5900';
        return jsonRes(200, { id: 'sub_unexpected_5900', status: 'canceled' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_save20',
        approvedAmountDue: 3900,
        approvedCurrency: 'usd',
        verificationReference: signedRefFor39,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.aborted).toBe(true);
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('AMOUNT_EXCEEDS_APPROVED');
    expect(body.clientSecret).toBeNull();
    expect(canceledSubId).toBe('sub_unexpected_5900');
  });

  it('10. CRITICAL ACCEPTANCE TEST: Unexpected $59 paid invoice after $0.00 approval -> blocked, incomplete subscription immediately canceled, and clientSecret is null', async () => {
    const signedZeroRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 5900,
        tax: 0,
        amountDueToday: 0,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_oct19_incident',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let canceledIncompleteSubId: string | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/')) {
        return jsonRes(200, mockFoundersPromo);
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        // Reproduces the exact Oct 19 failure: subscription created with $59.00 invoice and chargeable PaymentIntent
        return jsonRes(200, {
          id: 'sub_oct19_unwanted_59',
          status: 'incomplete',
          latest_invoice: {
            id: 'in_oct19_59',
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            discounts: [],
            payment_intent: {
              id: 'pi_oct19_59',
              amount: 5900,
              client_secret: 'pi_oct19_59_secret_must_never_leak',
            },
          },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions/sub_oct19_unwanted_59' && method === 'DELETE') {
        canceledIncompleteSubId = 'sub_oct19_unwanted_59';
        return jsonRes(200, { id: 'sub_oct19_unwanted_59', status: 'canceled' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: signedZeroRef,
      }),
      {
        env: testEnv,
        fetchImpl: mockFetch,
        nowFn: () => currentNowMs + 1000,
        onAuditEvent: (e) => auditEvents.push(e),
        idempotencyStore,
      },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.aborted).toBe(true);
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED');
    expect(body.clientSecret).toBeNull();
    expect(JSON.stringify(body)).not.toContain('pi_oct19_59_secret_must_never_leak');
    expect(canceledIncompleteSubId).toBe('sub_oct19_unwanted_59');
    expect(auditEvents.some((e) => e.eventType === 'amount_mismatch_blocked')).toBe(true);
  });

  it('11. Saved payment method -> verifies payment method belongs to customer and rejects payment methods owned by another customer', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_saved_pm',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/payment_methods/pm_foreign_card')) {
        return jsonRes(200, { id: 'pm_foreign_card', customer: 'cus_someone_else' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        paymentMethodId: 'pm_foreign_card',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe('PAYMENT_METHOD_OWNERSHIP_MISMATCH');
    expect(body.clientSecret).toBeNull();
  });

  it('12. Duplicate checkout submission -> prevented by server idempotency lock so only one subscription is created', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_dup_check',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let subPostCount = 0;
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        subPostCount++;
        return jsonRes(200, {
          id: 'sub_created_once',
          status: 'incomplete',
          latest_invoice: {
            id: 'in_once',
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            payment_intent: {
              id: 'pi_once',
              amount: 5900,
              client_secret: 'pi_once_secret_123',
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const reqBody = {
      email: 'adminapple@admin.com',
      name: 'Admin Apple',
      priceId: 'price_basic_5900',
      promotionCodeId: null,
      approvedAmountDue: 5900,
      approvedCurrency: 'usd',
      verificationReference: signedRef,
    };

    const firstRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', reqBody),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );
    expect(firstRes?.status).toBe(200);

    const secondRes = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', reqBody),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 2000, idempotencyStore },
    );
    expect(secondRes?.status).toBe(409);
    const secondBody = await secondRes!.json();
    expect(secondBody.code).toBe('DUPLICATE_CHECKOUT_SUBMISSION');
    expect(subPostCount).toBe(1);
  });

  it('13. Subscription creation failure -> returns clean error, no false success, and releases idempotency lock for retry', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_fail_retry',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(500, {
          error: { message: 'Stripe internal error', code: 'api_error' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(502);
    const body = await res!.json();
    expect(body.aborted).toBe(true);
    expect(body.clientSecret).toBeNull();
    expect(idempotencyStore.size).toBe(0);
  });

  it('14. Stripe outage / preview failure -> fails closed with verificationStatus: unavailable', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/')) {
        return jsonRes(503, { error: { message: 'Stripe unavailable', code: 'rate_limit' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/preview', {
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs },
    );

    expect(res?.status).toBe(502);
    const body = await res!.json();
    expect(body.verified).toBe(false);
    expect(body.verificationStatus).toBe('unavailable');
    expect(body.couponState).toBe('verification_unavailable');
  });

  it('15. Existing VAMO subscription compatibility -> protects preexisting active subscriptions from duplicate creation or cancellation and preserves canonical customer email linkage', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_existing_active_sub',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let deleteCalled = false;
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (method === 'DELETE') deleteCalled = true;
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_apple_1')) {
        return jsonRes(200, {
          data: [{ id: 'sub_preexisting_active_1', status: 'active' }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.code).toBe('EXISTING_ACTIVE_SUBSCRIPTION');
    expect(deleteCalled).toBe(false);
  });

  it('16. Redacts Stripe secret keys, PaymentIntent/SetupIntent client secrets, and Bearer tokens from server audit logs', () => {
    const raw = {
      stripe_secret_key: 'sk_live_51SecretKeyValue',
      clientSecret: 'pi_3Secret_secret_999',
      nested: {
        note: 'Header Bearer eyJhbGciOiJIUzI1NiJ9.token and seti_1Abc_secret_Xyz',
      },
    };
    const sanitized = redactServerValue(raw);
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('sk_live_');
    expect(serialized).not.toContain('pi_3Secret_secret_999');
    expect(serialized).not.toContain('seti_1Abc_secret_Xyz');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).toContain('[REDACTED]');
  });

  it('17. Exact promotion matching -> rejects unrelated positive discount and different coupon/promotion IDs (never falls back to discountTotal > 0)', async () => {
    // Direct unit checks on isPromotionPresentOnSubscriptionOrInvoice:
    // 17a. Unrelated positive discount with no matching promo or coupon ID -> false
    expect(
      isPromotionPresentOnSubscriptionOrInvoice(
        null,
        {
          id: 'in_unrelated',
          total_discount_amounts: [{ amount: 2000 }],
          discounts: [],
        },
        'promo_expected_123',
        'coupon_expected_123',
      ),
    ).toBe(false);

    // 17b. Different coupon / different promotion code on invoice -> false
    expect(
      isPromotionPresentOnSubscriptionOrInvoice(
        null,
        {
          id: 'in_different_coupon',
          total_discount_amounts: [{ amount: 5900, discount: { promotion_code: 'promo_other_999', coupon: { id: 'coupon_other_999' } } }],
          discounts: [{ promotion_code: 'promo_other_999', coupon: { id: 'coupon_other_999' } }],
        },
        'promo_expected_123',
        'coupon_expected_123',
      ),
    ).toBe(false);

    // 17c. Matching promotion code -> true
    expect(
      isPromotionPresentOnSubscriptionOrInvoice(
        null,
        {
          id: 'in_matching_promo',
          discounts: [{ promotion_code: 'promo_expected_123', coupon: { id: 'coupon_expected_123' } }],
        },
        'promo_expected_123',
        'coupon_expected_123',
      ),
    ).toBe(true);

    // 17d. End-to-end create-subscription check: invoice has $20 discount from a DIFFERENT coupon -> blocked & canceled
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'SAVE20',
        promotionCodeId: 'promo_save20_expected',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 2000,
        tax: 0,
        amountDueToday: 3900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_exact_promo_match',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let canceledSubId: string | null = null;
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/')) {
        return jsonRes(200, {
          ...mockFoundersPromo,
          id: 'promo_save20_expected',
          code: 'SAVE20',
          coupon: { ...mockFoundersPromo.coupon, id: 'coupon_save20_expected', percent_off: null, amount_off: 2000, currency: 'usd' },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        // Invoice has a $20 discount, but from an unrelated/different coupon!
        return jsonRes(200, {
          id: 'sub_wrong_coupon',
          status: 'incomplete',
          discounts: [{ promotion_code: 'promo_wrong_other', coupon: { id: 'coupon_wrong_other' } }],
          latest_invoice: {
            id: 'in_wrong_coupon',
            subtotal: 5900,
            tax: 0,
            amount_due: 3900,
            currency: 'usd',
            total_discount_amounts: [{ amount: 2000, discount: { promotion_code: 'promo_wrong_other', coupon: { id: 'coupon_wrong_other' } } }],
            discounts: [{ promotion_code: 'promo_wrong_other', coupon: { id: 'coupon_wrong_other' } }],
            payment_intent: {
              id: 'pi_wrong_coupon',
              amount: 3900,
              status: 'requires_payment_method',
              client_secret: 'pi_wrong_coupon_secret_never_leak',
            },
          },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions/sub_wrong_coupon' && method === 'DELETE') {
        canceledSubId = 'sub_wrong_coupon';
        return jsonRes(200, { id: 'sub_wrong_coupon', status: 'canceled' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_save20_expected',
        approvedAmountDue: 3900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('PROMOTION_NOT_APPLIED_ON_INVOICE');
    expect(body.clientSecret).toBeNull();
    expect(canceledSubId).toBe('sub_wrong_coupon');
  });

  it('18. Coupon expires between preview and create-subscription -> blocked before subscription creation', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 5900,
        tax: 0,
        amountDueToday: 0,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_promo_expired_between',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let subPostCalled = false;
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/')) {
        return jsonRes(200, {
          ...mockFoundersPromo,
          expires_at: Math.floor((currentNowMs - 5000) / 1000), // expired just before create-subscription!
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        subPostCalled = true;
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('PROMOTION_EXPIRED');
    expect(body.clientSecret).toBeNull();
    expect(subPostCalled).toBe(false);
  });

  it('19. Saved card on paid checkout -> never attaches default_payment_method before latest_invoice verification', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_saved_pm_paid_safe',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let createSubBody = '';
    let idempotencyHeaderOnCreate = '';
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/payment_methods/pm_saved_card_1')) {
        return jsonRes(200, { id: 'pm_saved_card_1', customer: 'cus_apple_1' });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        createSubBody = bodyText;
        const headers = new Headers(init?.headers);
        idempotencyHeaderOnCreate = headers.get('Idempotency-Key') || '';
        return jsonRes(200, {
          id: 'sub_saved_pm_paid',
          status: 'incomplete',
          latest_invoice: {
            id: 'in_saved_pm_paid',
            status: 'open',
            paid: false,
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            payment_intent: {
              id: 'pi_saved_pm_paid',
              amount: 5900,
              status: 'requires_payment_method',
              client_secret: 'pi_saved_pm_paid_secret_ok',
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        paymentMethodId: 'pm_saved_card_1',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.aborted).toBe(false);
    expect(body.blocked).toBe(false);
    expect(body.clientSecret).toBe('pi_saved_pm_paid_secret_ok');
    expect(createSubBody).toContain('payment_behavior=default_incomplete');
    expect(createSubBody).not.toContain('default_payment_method=');
    expect(idempotencyHeaderOnCreate).toBe(`sub_create_${mockDirectusUser.id}_nonce_saved_pm_paid_safe`);
  });

  it('20. Saved card on $0.00 checkout without pending_setup_intent -> attaches default_payment_method only AFTER $0.00 invoice verification succeeds', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 5900,
        tax: 0,
        amountDueToday: 0,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_saved_pm_zero_safe',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const callOrder: string[] = [];
    let createSubBody = '';
    let postVerifyAttachBody = '';

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/payment_methods/pm_saved_card_zero')) {
        return jsonRes(200, { id: 'pm_saved_card_zero', customer: 'cus_apple_1' });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url.startsWith('https://api.stripe.com/v1/promotion_codes/')) return jsonRes(200, mockFoundersPromo);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        callOrder.push('create_subscription');
        createSubBody = bodyText;
        return jsonRes(200, {
          id: 'sub_zero_saved_pm',
          status: 'active',
          discounts: [{ promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf', coupon: { id: 'coupon_founders_100' } }],
          pending_setup_intent: null,
          latest_invoice: {
            id: 'in_zero_saved_pm',
            status: 'paid',
            paid: true,
            subtotal: 5900,
            tax: 0,
            amount_due: 0,
            amount_paid: 0,
            currency: 'usd',
            total_discount_amounts: [{ amount: 5900, discount: { promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf', coupon: { id: 'coupon_founders_100' } } }],
            discounts: [{ promotion_code: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf' }],
            payment_intent: null,
          },
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions/sub_zero_saved_pm' && method === 'POST') {
        callOrder.push('attach_default_pm_after_verify');
        postVerifyAttachBody = bodyText;
        return jsonRes(200, { id: 'sub_zero_saved_pm', default_payment_method: 'pm_saved_card_zero' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        paymentMethodId: 'pm_saved_card_zero',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(200);
    expect(createSubBody).not.toContain('default_payment_method=');
    expect(callOrder).toEqual(['create_subscription', 'attach_default_pm_after_verify']);
    expect(postVerifyAttachBody).toContain('default_payment_method=pm_saved_card_zero');
  });

  it('21. Premature auto-charge protection -> refunds, cancels incomplete subscription, and blocks if Stripe ever returns an already-succeeded PaymentIntent before client confirmation', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_premature_charge',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let refundBody = '';
    let canceledSubId: string | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(200, {
          id: 'sub_premature_charged',
          status: 'active',
          latest_invoice: {
            id: 'in_premature_charged',
            status: 'paid',
            paid: true,
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            amount_paid: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            payment_intent: {
              id: 'pi_premature_5900',
              amount: 5900,
              status: 'succeeded',
              client_secret: 'pi_premature_5900_secret',
            },
          },
        });
      }
      if (url === 'https://api.stripe.com/v1/refunds' && method === 'POST') {
        refundBody = bodyText;
        return jsonRes(200, { id: 're_premature_1', status: 'succeeded' });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions/sub_premature_charged' && method === 'DELETE') {
        canceledSubId = 'sub_premature_charged';
        return jsonRes(200, { id: 'sub_premature_charged', status: 'canceled' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.blocked).toBe(true);
    expect(body.code).toBe('UNEXPECTED_PRE_VERIFICATION_CHARGE');
    expect(body.clientSecret).toBeNull();
    expect(refundBody).toContain('payment_intent=pi_premature_5900');
    expect(canceledSubId).toBe('sub_premature_charged');
  });

  it('22. Cross-isolate retry of interrupted checkout -> reuses existing incomplete subscription with matching metadata.verification_nonce without creating a duplicate', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_cross_isolate_retry',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    let subPostCalls = 0;
    // Simulate a brand new Worker isolate with an empty in-memory idempotencyStore,
    // where a previous attempt already created `sub_existing_incomplete_retry` in Stripe.
    const freshIsolateStore = new Map<string, IdempotencyEntry>();

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_apple_1')) {
        return jsonRes(200, {
          data: [
            {
              id: 'sub_existing_incomplete_retry',
              status: 'incomplete',
              metadata: {
                verification_nonce: 'nonce_cross_isolate_retry',
                idempotency_key: `idem_${mockDirectusUser.id}_nonce_cross_isolate_retry`,
              },
              latest_invoice: {
                id: 'in_existing_retry',
                status: 'open',
                paid: false,
                subtotal: 5900,
                tax: 0,
                amount_due: 5900,
                currency: 'usd',
                total_discount_amounts: [],
                payment_intent: {
                  id: 'pi_existing_retry',
                  amount: 5900,
                  status: 'requires_payment_method',
                  client_secret: 'pi_existing_retry_secret_reused',
                },
              },
            },
          ],
        });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        subPostCalls++;
        throw new Error('Should not create a second subscription when reusing incomplete subscription');
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 2000, idempotencyStore: freshIsolateStore },
    );

    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.aborted).toBe(false);
    expect(body.blocked).toBe(false);
    expect(body.subscriptionId).toBe('sub_existing_incomplete_retry');
    expect(body.clientSecret).toBe('pi_existing_retry_secret_reused');
    expect(body.reusedExistingIncompleteSubscription).toBe(true);
    expect(subPostCalls).toBe(0);
  });

  it('23. Cross-isolate duplicate submission -> blocks replay in a different Worker isolate when subscription for same nonce is already active', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: 'FOUNDERS90',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 5900,
        tax: 0,
        amountDueToday: 0,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_cross_isolate_completed',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const secondIsolateStore = new Map<string, IdempotencyEntry>();
    let subPostCalls = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_apple_1')) {
        return jsonRes(200, {
          data: [
            {
              id: 'sub_already_completed_nonce',
              status: 'active',
              metadata: {
                verification_nonce: 'nonce_cross_isolate_completed',
              },
            },
          ],
        });
      }
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        subPostCalls++;
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 2000, idempotencyStore: secondIsolateStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.code).toBe('DUPLICATE_CHECKOUT_SUBMISSION');
    expect(body.subscriptionId).toBe('sub_already_completed_nonce');
    expect(subPostCalls).toBe(0);
  });

  it('24. Concurrent cross-isolate request hitting Stripe 409 idempotency_key_in_use -> returns 409 DUPLICATE_CHECKOUT_SUBMISSION', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 5900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_stripe_409_in_use',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, { data: [] });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(409, {
          error: {
            code: 'idempotency_key_in_use',
            message: 'There is currently another in-progress request using this Idempotency Key.',
          },
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.code).toBe('DUPLICATE_CHECKOUT_SUBMISSION');
    expect(body.clientSecret).toBeNull();
  });

  it('25. Preexisting subscription protection -> never cancels a preexisting subscription even if reused or listed during a failed verification', async () => {
    const signedRef = await signVerificationReference(
      {
        v: 2,
        userId: mockDirectusUser.id,
        email: mockDirectusUser.email,
        customerId: 'cus_apple_1',
        priceId: 'price_basic_5900',
        promotionCode: null,
        promotionCodeId: null,
        originalPrice: 5900,
        subtotal: 5900,
        discountAmount: 0,
        tax: 0,
        amountDueToday: 3900,
        renewalAmount: 5900,
        currency: 'usd',
        issuedAt: currentNowMs,
        expiresAt: currentNowMs + 600_000,
        nonce: 'nonce_preexisting_never_delete',
      },
      testEnv.STRIPE_CHECKOUT_VERIFICATION_SECRET!,
    );

    const deletedSubIds: string[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.startsWith('https://api.vamo-app.com/users/me')) return jsonRes(200, { data: mockDirectusUser });
      if (url.startsWith('https://api.stripe.com/v1/customers')) {
        return jsonRes(200, { data: [{ id: 'cus_apple_1', email: 'adminapple@admin.com' }] });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions?customer=')) {
        return jsonRes(200, {
          data: [
            { id: 'sub_historical_canceled_1', status: 'canceled', metadata: { verification_nonce: 'old_nonce' } },
          ],
        });
      }
      if (url.startsWith('https://api.stripe.com/v1/prices/')) return jsonRes(200, mockBasicPrice);
      if (url === 'https://api.stripe.com/v1/subscriptions' && method === 'POST') {
        return jsonRes(200, {
          id: 'sub_new_bad_amount',
          status: 'incomplete',
          latest_invoice: {
            id: 'in_new_bad',
            subtotal: 5900,
            tax: 0,
            amount_due: 5900,
            currency: 'usd',
            total_discount_amounts: [],
            payment_intent: { id: 'pi_new_bad', amount: 5900, status: 'requires_payment_method', client_secret: 'pi_secret' },
          },
        });
      }
      if (url.startsWith('https://api.stripe.com/v1/subscriptions/') && method === 'DELETE') {
        deletedSubIds.push(url.split('/').pop()!);
        return jsonRes(200, { status: 'canceled' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    const res = await handleCheckoutApiRequest(
      buildPostRequest('/api/checkout/create-subscription', {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_5900',
        promotionCodeId: null,
        approvedAmountDue: 3900,
        approvedCurrency: 'usd',
        verificationReference: signedRef,
      }),
      { env: testEnv, fetchImpl: mockFetch, nowFn: () => currentNowMs + 1000, idempotencyStore },
    );

    expect(res?.status).toBe(409);
    expect(deletedSubIds).toEqual(['sub_new_bad_amount']);
    expect(deletedSubIds).not.toContain('sub_historical_canceled_1');
  });

  it('26. Cloudflare Worker routing (src/server/worker.ts) -> routes /api/checkout/* to checkout backend and delegates SPA/static requests to ASSETS binding', async () => {
    let assetsFetchedUrl: string | null = null;
    const workerEnv = {
      ...testEnv,
      ASSETS: {
        fetch: async (input: RequestInfo | URL) => {
          assetsFetchedUrl = input instanceof Request ? input.url : String(input);
          return new Response('<html>SPA index.html</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        },
      },
    };

    // Non-API SPA deep link -> delegated to ASSETS
    const spaRes = await worker.fetch(new Request('https://business.vamo-app.com/app/billing'), workerEnv);
    expect(spaRes.status).toBe(200);
    expect(assetsFetchedUrl).toBe('https://business.vamo-app.com/app/billing');
    expect(await spaRes.text()).toContain('SPA index.html');

    // /api/checkout/preview without auth -> handled by checkout Worker (401 AUTH_REQUIRED, never falls through to ASSETS)
    assetsFetchedUrl = null;
    const apiRes = await worker.fetch(
      new Request('https://business.vamo-app.com/api/checkout/preview', {
        method: 'POST',
        headers: {
          Origin: 'https://business.vamo-app.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId: 'price_basic_5900' }),
      }),
      workerEnv,
    );
    expect(apiRes.status).toBe(401);
    expect(assetsFetchedUrl).toBeNull();
    const apiBody = await apiRes.json();
    expect(apiBody.code).toBe('AUTH_REQUIRED');
  });
});

