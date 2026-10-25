import {
  createReadOnlyStripeClient,
  handlePaymentMethodStatusRequest,
  handleSubscriptionChangePreviewRequest,
  resolveEnvironmentProfile,
  StripePreviewWorkerEnv,
} from './stripe-upgrade-preview';

describe('Independent Read-Only Stripe Upgrade Preview Worker Module', () => {
  const stagingUrl = 'https://staging-business.vamo-app.com/api/billing/subscription-change-preview';
  const stagingEnv: StripePreviewWorkerEnv = {
    STRIPE_SECRET_KEY: 'sk_test_sandbox_123456',
    DIRECTUS_URL: 'https://quepasa-api.c1oud7.de',
    APPROVED_PRICE_IDS: 'price_starter_31,price_basic_59,price_advanced_89',
  };

  function makeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  describe('1. Environment & Credential Isolation (resolveEnvironmentProfile)', () => {
    it('returns 503 STRIPE_CREDENTIALS_MISSING when STRIPE_SECRET_KEY is not configured', async () => {
      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({}),
      });
      const res = await handleSubscriptionChangePreviewRequest(req, {
        DIRECTUS_URL: 'https://quepasa-api.c1oud7.de',
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe('STRIPE_CREDENTIALS_MISSING');
    });

    it('rejects live Stripe secret key (sk_live_) on staging (STRIPE_ENVIRONMENT_MISMATCH)', () => {
      const profile = resolveEnvironmentProfile(new URL(stagingUrl), {
        STRIPE_SECRET_KEY: 'sk_live_prod_secret',
        DIRECTUS_URL: 'https://quepasa-api.c1oud7.de',
      });
      expect(profile.environmentMismatch).toBe(true);
    });

    it('rejects test Stripe secret key (sk_test_) on production (STRIPE_ENVIRONMENT_MISMATCH)', () => {
      const profile = resolveEnvironmentProfile(
        new URL('https://business.vamo-app.com/api/billing/subscription-change-preview'),
        {
          STRIPE_SECRET_KEY: 'sk_test_sandbox_secret',
          DIRECTUS_URL: 'https://api.vamo-app.com',
        },
      );
      expect(profile.environmentMismatch).toBe(true);
    });

    it('rejects cross-environment Directus pairing (staging host with api.vamo-app.com)', () => {
      const profile = resolveEnvironmentProfile(new URL(stagingUrl), {
        STRIPE_SECRET_KEY: 'sk_test_sandbox_secret',
        DIRECTUS_URL: 'https://api.vamo-app.com',
      });
      expect(profile.environmentMismatch).toBe(true);
    });

    it('accepts valid staging configuration (staging-business.vamo-app.com + quepasa-api.c1oud7.de + sk_test_)', () => {
      const profile = resolveEnvironmentProfile(new URL(stagingUrl), stagingEnv);
      expect(profile.environmentMismatch).toBe(false);
      expect(profile.mode).toBe('test');
      expect(profile.directusUrl).toBe('https://quepasa-api.c1oud7.de');
    });
  });

  describe('2. Strict Read-Only Stripe Client Guard (createReadOnlyStripeClient)', () => {
    it('proves preview and payment-method client cannot mutate subscriptions, create invoices, charge cards, or issue refunds', async () => {
      const fetchSpy = vi.fn();
      const client = createReadOnlyStripeClient('sk_test_sandbox_123456', fetchSpy as any);

      const forbiddenMutations: Array<{ method: string; path: string }> = [
        { method: 'POST', path: '/v1/subscriptions/sub_123' },
        { method: 'POST', path: '/v1/subscriptions' },
        { method: 'POST', path: '/v1/invoices' },
        { method: 'POST', path: '/v1/invoices/in_123/pay' },
        { method: 'POST', path: '/v1/payment_intents' },
        { method: 'POST', path: '/v1/payment_intents/pi_123/confirm' },
        { method: 'POST', path: '/v1/refunds' },
        { method: 'POST', path: '/v1/payment_methods/pm_123/attach' },
        { method: 'POST', path: '/v1/payment_methods/pm_123/detach' },
        { method: 'POST', path: '/v1/customers/cus_123' },
        { method: 'DELETE', path: '/v1/subscriptions/sub_123' },
      ];

      for (const call of forbiddenMutations) {
        await expect(client.rawRequest(call.method, call.path)).rejects.toThrow(
          /READ_ONLY_STRIPE_VIOLATION/,
        );
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Upgrade Invoice Preview Endpoint (handleSubscriptionChangePreviewRequest)', () => {
    const validRequestBody = {
      subscriptionId: 'sub_123',
      subscriptionItemId: 'si_456',
      currentPriceId: 'price_starter_31',
      targetPriceId: 'price_basic_59',
      currentPeriodStart: 1700000000,
      currentPeriodEnd: 1702500000,
      customerEmail: 'owner@vamo.do',
    };

    it('1. returns authoritative Stripe upgrade preview with prorationDelta, discountAmount, tax, amountDueToday, renewalAmount, and chargeAmountEnforcedByServer=false', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: {
              id: 'user-uuid-1',
              email: 'owner@vamo.do',
              status: 'active',
              stripe_customer_id: 'cus_123',
              provider_link: { id: 'prov_99', status: 'published' },
            },
          });
        }
        if (url.includes('/v1/subscriptions/sub_123')) {
          return makeJsonResponse({
            id: 'sub_123',
            status: 'active',
            customer: 'cus_123',
            default_payment_method: 'pm_sub_2',
            current_period_start: 1700000000,
            current_period_end: 1702500000,
            items: {
              data: [
                {
                  id: 'si_456',
                  quantity: 1,
                  price: {
                    id: 'price_starter_31',
                    unit_amount: 3100,
                    currency: 'usd',
                    recurring: { interval: 'month' },
                  },
                },
              ],
            },
          });
        }
        if (url.includes('/v1/customers/cus_123')) {
          return makeJsonResponse({
            id: 'cus_123',
            email: 'owner@vamo.do',
            metadata: { provider_id: 'prov_99' },
            invoice_settings: { default_payment_method: 'pm_cust_1' },
          });
        }
        if (url.includes('/v1/prices/price_basic_59')) {
          return makeJsonResponse({
            id: 'price_basic_59',
            active: true,
            type: 'recurring',
            currency: 'usd',
            unit_amount: 5900,
            recurring: { interval: 'month' },
            product: { id: 'prod_basic', name: 'VAMO Basic Plan', active: true },
          });
        }
        if (url.includes('/v1/payment_methods?')) {
          return makeJsonResponse({
            data: [
              {
                id: 'pm_sub_2',
                card: { brand: 'mastercard', last4: '2222', exp_month: 12, exp_year: 2029 },
              },
            ],
          });
        }
        if (url.includes('/v1/invoices/create_preview')) {
          const bodyText = String(init?.body ?? '');
          expect(bodyText).toContain('subscription=sub_123');
          expect(bodyText).toContain('subscription_details%5Bitems%5D%5B0%5D%5Bid%5D=si_456');
          expect(bodyText).toContain(
            'subscription_details%5Bitems%5D%5B0%5D%5Bprice%5D=price_basic_59',
          );
          expect(bodyText).toContain('subscription_details%5Bproration_behavior%5D=always_invoice');

          return makeJsonResponse({
            currency: 'usd',
            subtotal: 1500,
            tax: 120,
            total: 1320,
            amount_due: 1320,
            total_discount_amounts: [{ amount: 300 }],
            lines: {
              data: [
                { amount: -1450, proration: true },
                { amount: 2950, proration: true },
              ],
            },
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify(validRequestBody),
      });

      const res = await handleSubscriptionChangePreviewRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.verified).toBe(true);
      expect(data.customerId).toBe('cus_123');
      expect(data.subscriptionId).toBe('sub_123');
      expect(data.subscriptionItemId).toBe('si_456');
      expect(data.currentPriceId).toBe('price_starter_31');
      expect(data.targetPriceId).toBe('price_basic_59');
      expect(data.prorationDelta).toBe(1500);
      expect(data.discountAmount).toBe(300);
      expect(data.tax).toBe(120);
      expect(data.amountDueToday).toBe(1320);
      expect(data.renewalAmount).toBe(5900);
      expect(data.defaultPaymentMethodId).toBe('pm_sub_2');
      expect(data.defaultPaymentMethodSource).toBe('subscription');
      expect(data.defaultPaymentMethodVerified).toBe(true);
      expect(data.chargeAmountEnforcedByServer).toBe(false);
    });

    it('2. rejects unauthorized requests without valid Directus Bearer token (401 UNAUTHORIZED)', async () => {
      const fetchSpy = vi.fn();
      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      });

      const res = await handleSubscriptionChangePreviewRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.code).toBe('UNAUTHORIZED');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('3. rejects cross-customer and cross-business access attempts (403)', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: {
              id: 'user-uuid-1',
              email: 'owner@vamo.do',
              status: 'active',
              stripe_customer_id: 'cus_owner_1',
              provider_link: { id: 'prov_owner_1' },
            },
          });
        }
        if (url.includes('/v1/subscriptions/sub_other')) {
          return makeJsonResponse({
            id: 'sub_other',
            status: 'active',
            customer: 'cus_victim_2',
            items: {
              data: [{ id: 'si_456', price: { id: 'price_starter_31', unit_amount: 3100 } }],
            },
          });
        }
        if (url.includes('/v1/customers/cus_victim_2')) {
          return makeJsonResponse({
            id: 'cus_victim_2',
            email: 'victim@vamo.do',
            metadata: { provider_id: 'prov_victim_2' },
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({ ...validRequestBody, subscriptionId: 'sub_other' }),
      });

      const res = await handleSubscriptionChangePreviewRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.code).toBe('CUSTOMER_OWNERSHIP_MISMATCH');
    });

    it('4. rejects invalid subscription ID or mismatched subscription item ID', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: { id: 'u1', email: 'owner@vamo.do', status: 'active', stripe_customer_id: 'cus_123' },
          });
        }
        if (url.includes('/v1/subscriptions/sub_123')) {
          return makeJsonResponse({
            id: 'sub_123',
            status: 'active',
            customer: 'cus_123',
            items: {
              data: [{ id: 'si_actual_999', price: { id: 'price_starter_31', unit_amount: 3100 } }],
            },
          });
        }
        if (url.includes('/v1/customers/cus_123')) {
          return makeJsonResponse({ id: 'cus_123', email: 'owner@vamo.do' });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const badSubReq = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({ ...validRequestBody, subscriptionId: 'invalid_id' }),
      });
      const badSubRes = await handleSubscriptionChangePreviewRequest(
        badSubReq,
        stagingEnv,
        fetchSpy as any,
      );
      expect(badSubRes.status).toBe(400);
      expect((await badSubRes.json()).code).toBe('INVALID_SUBSCRIPTION_ID');

      const badItemReq = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({ ...validRequestBody, subscriptionItemId: 'si_wrong_111' }),
      });
      const badItemRes = await handleSubscriptionChangePreviewRequest(
        badItemReq,
        stagingEnv,
        fetchSpy as any,
      );
      expect(badItemRes.status).toBe(400);
      expect((await badItemRes.json()).code).toBe('SUBSCRIPTION_ITEM_MISMATCH');
    });

    it('5. rejects invalid, non-recurring, unapproved, or downgrade target Price IDs (400 INVALID_TARGET_PRICE)', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: { id: 'u1', email: 'owner@vamo.do', status: 'active', stripe_customer_id: 'cus_123' },
          });
        }
        if (url.includes('/v1/subscriptions/sub_123')) {
          return makeJsonResponse({
            id: 'sub_123',
            status: 'active',
            customer: 'cus_123',
            current_period_end: 1702500000,
            items: {
              data: [
                {
                  id: 'si_456',
                  price: { id: 'price_basic_59', unit_amount: 5900, currency: 'usd' },
                },
              ],
            },
          });
        }
        if (url.includes('/v1/customers/cus_123')) {
          return makeJsonResponse({ id: 'cus_123', email: 'owner@vamo.do' });
        }
        if (url.includes('/v1/prices/price_starter_31')) {
          return makeJsonResponse({
            id: 'price_starter_31',
            active: true,
            type: 'recurring',
            currency: 'usd',
            unit_amount: 3100,
            recurring: { interval: 'month' },
            product: { id: 'prod_starter', name: 'Starter Plan', active: true },
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({
          ...validRequestBody,
          currentPriceId: 'price_basic_59',
          targetPriceId: 'price_starter_31',
        }),
      });

      const res = await handleSubscriptionChangePreviewRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.code).toBe('INVALID_TARGET_PRICE');
    });

    it('8. returns 502 STRIPE_PREVIEW_FAILED when Stripe create_preview fails', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: { id: 'u1', email: 'owner@vamo.do', status: 'active', stripe_customer_id: 'cus_123' },
          });
        }
        if (url.includes('/v1/subscriptions/sub_123')) {
          return makeJsonResponse({
            id: 'sub_123',
            status: 'active',
            customer: 'cus_123',
            current_period_end: 1702500000,
            items: {
              data: [
                {
                  id: 'si_456',
                  price: { id: 'price_starter_31', unit_amount: 3100, currency: 'usd' },
                },
              ],
            },
          });
        }
        if (url.includes('/v1/customers/cus_123')) {
          return makeJsonResponse({ id: 'cus_123', email: 'owner@vamo.do' });
        }
        if (url.includes('/v1/prices/price_basic_59')) {
          return makeJsonResponse({
            id: 'price_basic_59',
            active: true,
            type: 'recurring',
            currency: 'usd',
            unit_amount: 5900,
            recurring: { interval: 'month' },
            product: { id: 'prod_basic', name: 'Basic Plan', active: true },
          });
        }
        if (url.includes('/v1/payment_methods?')) {
          return makeJsonResponse({ data: [] });
        }
        if (url.includes('/v1/invoices/create_preview')) {
          return makeJsonResponse({ error: { message: 'Stripe internal error' } }, 500);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const req = new Request(stagingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify(validRequestBody),
      });

      const res = await handleSubscriptionChangePreviewRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.verified).toBe(false);
      expect(data.code).toBe('STRIPE_PREVIEW_FAILED');
    });
  });

  describe('4. Default Payment Method Status Endpoint (handlePaymentMethodStatusRequest)', () => {
    const statusUrl = 'https://staging-business.vamo-app.com/api/billing/payment-method-status';

    it('enforces subscription.default_payment_method over customer.invoice_settings.default_payment_method and never treats non-default saved cards as default', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/users/me')) {
          return makeJsonResponse({
            data: {
              id: 'u1',
              email: 'owner@vamo.do',
              status: 'active',
              stripe_customer_id: 'cus_123',
            },
          });
        }
        if (url.includes('/v1/customers/cus_123')) {
          return makeJsonResponse({
            id: 'cus_123',
            email: 'owner@vamo.do',
            invoice_settings: { default_payment_method: 'pm_cust_1' },
          });
        }
        if (url.includes('/v1/subscriptions?')) {
          return makeJsonResponse({
            data: [
              {
                id: 'sub_123',
                status: 'active',
                customer: 'cus_123',
                default_payment_method: 'pm_sub_2',
              },
            ],
          });
        }
        if (url.includes('/v1/payment_methods?')) {
          return makeJsonResponse({
            data: [
              {
                id: 'pm_cust_1',
                card: { brand: 'visa', last4: '1111', exp_month: 10, exp_year: 2029 },
              },
              {
                id: 'pm_sub_2',
                card: { brand: 'mastercard', last4: '2222', exp_month: 12, exp_year: 2029 },
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const req = new Request(statusUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-directus-token',
        },
        body: JSON.stringify({ customerEmail: 'owner@vamo.do' }),
      });

      const res = await handlePaymentMethodStatusRequest(req, stagingEnv, fetchSpy as any);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.defaultVerified).toBe(true);
      expect(data.defaultPaymentMethodId).toBe('pm_sub_2');
      expect(data.defaultPaymentMethodSource).toBe('subscription');
      expect(data.subscriptionDefaultPaymentMethodId).toBe('pm_sub_2');
      expect(data.customerDefaultPaymentMethodId).toBe('pm_cust_1');
      expect(data.paymentMethods.find((m: any) => m.id === 'pm_sub_2')?.isRenewalCard).toBe(true);
      expect(data.paymentMethods.find((m: any) => m.id === 'pm_cust_1')?.isRenewalCard).toBe(false);
    });
  });
});
