import { TestBed } from '@angular/core/testing';
import { StripeService, StripePlan } from './stripe.service';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { runtimeConfig } from '../config/runtime-config';

describe('StripeService', () => {
  let service: StripeService;
  let authServiceSpy: any;

  beforeEach(() => {
    runtimeConfig.reset();

    authServiceSpy = {
      safeRequest: vi.fn((fn) => fn()),
      getToken: vi.fn().mockResolvedValue('test-jwt-token'),
      currentUser: { email: 'business@example.com' },
    };

    TestBed.configureTestingModule({
      providers: [
        StripeService,
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    service = TestBed.inject(StripeService);
  });

  afterEach(() => {
    runtimeConfig.reset();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('tierFromProductName', () => {
    it('should identify starter, basic, and advanced tiers from product names', () => {
      expect(service.tierFromProductName('Starter Plan')).toBe('starter');
      expect(service.tierFromProductName('VAMO Basic')).toBe('basic');
      expect(service.tierFromProductName('Advanced Subscription')).toBe('advanced');
      expect(service.tierFromProductName('Custom Enterprise')).toBeNull();
    });
  });

  describe('planTitleKey', () => {
    it('should return matching i18n key for recognized tier names', () => {
      expect(service.planTitleKey('Starter Plan')).toBe('PAYMENT.PLANS.STARTER.TITLE');
      expect(service.planTitleKey('VAMO Basic')).toBe('PAYMENT.PLANS.BASIC.TITLE');
      expect(service.planTitleKey('Advanced Subscription')).toBe('PAYMENT.PLANS.ADVANCED.TITLE');
    });

    it('should pass through unrecognized names unchanged and return empty string for null/undefined', () => {
      expect(service.planTitleKey('Custom Enterprise')).toBe('Custom Enterprise');
      expect(service.planTitleKey(null)).toBe('');
      expect(service.planTitleKey(undefined)).toBe('');
      expect(service.planTitleKey('')).toBe('');
    });
  });

  describe('getPlanTitle', () => {
    it('should return localized plan title in current language and update on language switch', () => {
      const i18n = TestBed.inject(I18nService);
      i18n.setLang('en');
      expect(service.getPlanTitle('Starter Plan')).toBe('Starter Plan');
      expect(service.getPlanTitle('Basic Plan')).toBe('Basic Plan');
      expect(service.getPlanTitle('Advanced Plan')).toBe('Advanced Plan');

      i18n.setLang('es');
      expect(service.getPlanTitle('Starter Plan')).toBe('Plan Inicial');
      expect(service.getPlanTitle('Basic Plan')).toBe('Plan Básico');
      expect(service.getPlanTitle('Advanced Plan')).toBe('Plan Avanzado');

      i18n.setLang('en');
    });

    it('should pass through unrecognized names without defaulting to Starter', () => {
      expect(service.getPlanTitle('Custom Enterprise')).toBe('Custom Enterprise');
      expect(service.getPlanTitle('VIP Platinum')).toBe('VIP Platinum');
    });

    it('should return empty string for null, undefined, or empty string', () => {
      expect(service.getPlanTitle(null)).toBe('');
      expect(service.getPlanTitle(undefined)).toBe('');
      expect(service.getPlanTitle('')).toBe('');
    });
  });

  describe('formatPrice', () => {
    it('should format cents into localized currency string', () => {
      const formatted = service.formatPrice(2900, 'usd');
      expect(formatted).toContain('29');
      expect(formatted).toContain('$');
    });
  });

  describe('flowPost execution', () => {
    it('uses the session wrapper and rebuilds Authorization on an expired-token retry', async () => {
      authServiceSpy.getToken.mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token');
      authServiceSpy.safeRequest.mockImplementation(async (fn: any) => {
        try { return await fn(); } catch (err: any) {
          expect(err.status).toBe(401);
          expect(err.errors[0].extensions.code).toBe('TOKEN_EXPIRED');
          return fn();
        }
      });
      const fetch = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => JSON.stringify({ errors: [{ extensions: { code: 'TOKEN_EXPIRED' } }] }) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ subscription: null }) } as Response);
      expect(await service.flowPost('read-subscription-flow', {})).toEqual({ subscription: null });
      expect(authServiceSpy.safeRequest).toHaveBeenCalledOnce();
      expect((fetch.mock.calls[0][1]?.headers as any).Authorization).toBe('Bearer expired-token');
      expect((fetch.mock.calls[1][1]?.headers as any).Authorization).toBe('Bearer fresh-token');
    });

    it('should throw an informative error if flowId is missing', async () => {
      await expect(service.flowPost('', {})).rejects.toThrow('Flow configuration identifier is missing.');
    });

    it('should execute fetch with Authorization header and return parsed data', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      } as any);

      const result = await service.flowPost('flow-123', { key: 'value' });
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/flows/trigger/flow-123'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ key: 'value' }),
        })
      );
    });

    it('should throw error when flow returns non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid payload',
      } as any);

      await expect(service.flowPost('flow-err', {})).rejects.toThrow('Flow request failed (400)');
    });
  });

  it('reads publishing limits from the canonical settings field', async () => {
    const { directusClient } = await import('../directus/directus-client');
    const limits = [{ productName: 'Basic', max_posts: 4 }];
    const request = vi.spyOn(directusClient, 'request').mockResolvedValueOnce([{ plan_limits: limits }] as any);
    expect(await service.getPlanLimits()).toEqual(limits);
    const options = (request.mock.calls[0][0] as any)();
    expect(options.path).toBe('/items/settings');
    expect(options.params.fields).toEqual(['plan_limits']);
  });

  it('rejects missing subscription configuration instead of reporting no subscription', async () => {
    runtimeConfig.updateConfig({ stripeGetSubscriptionFlow: '' });
    await expect(service.getSubscription('business@example.com')).rejects.toThrow('not configured');
  });

  describe('getPlans', () => {
    it('should throw safe customer error when flow is unconfigured and never return fake fallbacks', async () => {
      runtimeConfig.updateConfig({ stripeGetPricesFlow: '' });

      await expect(service.getPlans()).rejects.toThrow(
        "We couldn't load current plan pricing. Please try again."
      );
    });

    it('should throw safe customer error when flow returns no active prices', async () => {
      runtimeConfig.updateConfig({ stripeGetPricesFlow: 'flow-prices' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        data: [
          { id: 'price-inactive', active: false, unit_amount: 1000 },
          { id: 'price-zero', active: true, unit_amount: 0 },
        ],
      });

      await expect(service.getPlans()).rejects.toThrow(
        "We couldn't load current plan pricing. Please try again."
      );
    });

    it('should map flow prices into StripePlan objects with canonical entitlements when flow is configured', async () => {
      runtimeConfig.updateConfig({ stripeGetPricesFlow: 'flow-prices' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        data: [
          {
            id: 'price_starter_live',
            active: true,
            unit_amount: 2900,
            currency: 'usd',
            recurring: { interval: 'month' },
            product: { name: 'Starter Plan', description: 'Desc 1' },
          },
          {
            id: 'price_basic_live',
            active: true,
            unit_amount: 5900,
            currency: 'usd',
            recurring: { interval: 'month' },
            product: { name: 'Basic Plan', description: 'Desc 2' },
          },
        ],
      });

      const plans = await service.getPlans();
      expect(plans.length).toBe(2);
      expect(plans[0].id).toBe('price_starter_live');
      expect(plans[0].tier).toBe('starter');
      expect(plans[0].amount).toBe(2900);
      expect(plans[0].maxPosts).toBe(1);

      expect(plans[1].id).toBe('price_basic_live');
      expect(plans[1].tier).toBe('basic');
      expect(plans[1].amount).toBe(5900);
      expect(plans[1].maxPosts).toBe(4);
    });
  });

  describe('validatePromoCode', () => {
    it('should send code to stripeValidatePromoFlow and return promo result', async () => {
      runtimeConfig.updateConfig({ stripeValidatePromoFlow: 'flow-promo' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          name: 'SUMMER2026',
          percentOff: 20,
        },
      });

      const res = await service.validatePromoCode('SUMMER2026');
      expect(res.valid).toBe(true);
      expect(res.percentOff).toBe(20);
    });

    it('should return valid: false if flow is unconfigured', async () => {
      runtimeConfig.updateConfig({ stripeValidatePromoFlow: '' });
      const res = await service.validatePromoCode('SUMMER2026');
      expect(res.valid).toBe(false);
    });
  });

  describe('createSubscription', () => {
    it('should reject invalid or fake price IDs not starting with price_', async () => {
      await expect(
        service.createSubscription('business@example.com', 'Acme Cafe', 'fake_plan_id')
      ).rejects.toThrow('Invalid plan selection. Please select an active plan.');
    });

    it('should call stripeCreateSubscriptionFlow and return clientSecret and subscriptionId', async () => {
      runtimeConfig.updateConfig({ stripeCreateSubscriptionFlow: 'flow-create-sub' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          clientSecret: 'pi_test_secret',
          subscriptionId: 'sub_test_123',
          requiresSetup: false,
        },
      });

      const res = await service.createSubscription(
        'business@example.com',
        'Acme Cafe',
        'price_12345'
      );
      expect(res.clientSecret).toBe('pi_test_secret');
      expect(res.subscriptionId).toBe('sub_test_123');
      expect(res.requiresSetup).toBe(false);
    });
  });

  describe('cancelSubscription and changeSubscriptionPlan', () => {
    it('should call cancel flow with subscriptionId and cancelAtPeriodEnd flag', async () => {
      runtimeConfig.updateConfig({ stripeCancelSubscriptionFlow: 'flow-cancel' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      await service.cancelSubscription('sub_999', true);

      expect(postSpy).toHaveBeenCalledWith('flow-cancel', {
        subscriptionId: 'sub_999',
        cancelAtPeriodEnd: true,
      });
    });

    it('should call change plan flow with compatible payload only and return unverified on empty HTTP 200 response', async () => {
      runtimeConfig.updateConfig({ stripeChangeSubscriptionFlow: 'flow-change' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      const res = await service.changeSubscriptionPlan(
        'sub_1',
        'si_1',
        'price_adv',
        true,
        'Advanced Plan',
        1700000000,
        1702500000,
        'price_basic'
      );

      expect(postSpy).toHaveBeenCalledWith('flow-change', {
        subscriptionId: 'sub_1',
        subscriptionItemId: 'si_1',
        newPriceId: 'price_adv',
        isUpgrade: true,
        newPlanName: 'Advanced Plan',
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        currentPriceId: 'price_basic',
      });
      const sentPayload = postSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(Object.keys(sentPayload).sort()).toEqual([
        'currentPeriodEnd',
        'currentPeriodStart',
        'currentPriceId',
        'isUpgrade',
        'newPlanName',
        'newPriceId',
        'subscriptionId',
        'subscriptionItemId',
      ]);
      expect(res.status).toBe('unverified');
    });

    it('should treat null or disconnected change_result responses as unverified rather than confirmed', async () => {
      runtimeConfig.updateConfig({ stripeChangeSubscriptionFlow: 'flow-change' });
      const postSpy = vi.spyOn(service, 'flowPost');

      postSpy.mockResolvedValueOnce(null);
      const nullRes = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_adv', true, 'Advanced Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(nullRes.status).toBe('unverified');

      postSpy.mockResolvedValueOnce({ change_result: null });
      const disconnectedRes = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_starter', false, 'Starter Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(disconnectedRes.status).toBe('unverified');
    });

    it('should normalize requires_action, pending_payment, confirmed upgrade, and scheduled downgrade responses', async () => {
      runtimeConfig.updateConfig({ stripeChangeSubscriptionFlow: 'flow-change' });
      const postSpy = vi.spyOn(service, 'flowPost');

      postSpy.mockResolvedValueOnce({
        change_result: { status: 'requires_action', clientSecret: 'pi_3ds_secret' },
      });
      const actionRes = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_adv', true, 'Advanced Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(actionRes.status).toBe('requires_action');
      expect(actionRes.clientSecret).toBe('pi_3ds_secret');

      postSpy.mockResolvedValueOnce({
        change_result: { status: 'incomplete' },
      });
      const pendingRes = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_adv', true, 'Advanced Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(pendingRes.status).toBe('pending_payment');

      // Pending fields alone without verified schedule phases/timing must return unverified
      postSpy.mockResolvedValueOnce({
        change_result: { scheduleId: 'sub_sched_42', pendingPlanName: 'Starter Plan' },
      });
      const unverifiedDowngrade = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_starter', false, 'Starter Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(unverifiedDowngrade.status).toBe('unverified');

      // Schedule confirming target priceId and renewal timing returns scheduled
      postSpy.mockResolvedValueOnce({
        change_result: {
          id: 'sub_sched_42',
          object: 'subscription_schedule',
          status: 'active',
          phases: [
            { start_date: 1700000000, end_date: 1702500000, items: [{ price: 'price_basic' }] },
            { start_date: 1702500000, items: [{ price: 'price_starter' }] },
          ],
        },
      });
      const schedRes = await service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_starter', false, 'Starter Plan', 1700000000, 1702500000, 'price_basic'
      );
      expect(schedRes.status).toBe('scheduled');
      expect(schedRes.scheduleId).toBe('sub_sched_42');
    });

    it('should deduplicate concurrent identical changeSubscriptionPlan calls', async () => {
      runtimeConfig.updateConfig({ stripeChangeSubscriptionFlow: 'flow-change' });
      let resolveFlow!: (value: any) => void;
      const postSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(
        new Promise((res) => {
          resolveFlow = res;
        })
      );

      const p1 = service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_adv', true, 'Advanced Plan', 1700000000, 1702500000, 'price_basic'
      );
      const p2 = service.changeSubscriptionPlan(
        'sub_1', 'si_1', 'price_adv', true, 'Advanced Plan', 1700000000, 1702500000, 'price_basic'
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      resolveFlow({
        change_result: {
          status: 'active',
          priceId: 'price_adv',
          paymentIntentStatus: 'succeeded',
        },
      });
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.status).toBe('confirmed');
      expect(r2.status).toBe('confirmed');
    });

    it('distinguishes full schedule verification from lookup-reported scheduled downgrades and rejects invalid or contradictory pending fields', () => {
      const reportedBasicDowngradeFixture = {
        subscriptionId: 'sub_example',
        subscriptionItemId: 'si_example',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1791888342,
        currentPeriodEnd: 1794566742,
        plan: {
          priceId: 'price_current',
          productName: 'Advanced Plan',
          amount: 9900,
          currency: 'usd',
          interval: 'month',
        },
        pendingPlanName: 'Basic Plan',
        pendingPeriodEnd: 1794566742,
        pendingScheduleId: 'sub_sched_example',
      };

      // Lookup-reported scheduled downgrade (no schedule phases exposed by unchanged flow)
      expect(
        service.evaluateScheduledDowngrade(reportedBasicDowngradeFixture, {
          expectedSubscriptionId: 'sub_example',
          currentPriceId: 'price_current',
          targetPriceId: 'price_basic',
          targetPlanName: 'Basic Plan',
          targetTier: 'basic',
          expectedRenewalTimestamp: 1794566742,
          nowSeconds: 1791900000,
        })
      ).toBe('reported_by_lookup');

      // Full schedule verification when schedule phases confirm target priceId and renewal date
      expect(
        service.evaluateScheduledDowngrade(
          {
            ...reportedBasicDowngradeFixture,
            schedule: {
              id: 'sub_sched_example',
              status: 'active',
              phases: [
                { start_date: 1791888342, end_date: 1794566742, items: [{ price: 'price_current' }] },
                { start_date: 1794566742, items: [{ price: 'price_basic' }] },
              ],
            },
          },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('verified_schedule');

      // Missing schedule ID -> unverified
      expect(
        service.evaluateScheduledDowngrade(
          { ...reportedBasicDowngradeFixture, pendingScheduleId: '   ' },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('unverified');

      // Mismatched target or loose non-canonical substring -> unverified
      expect(
        service.evaluateScheduledDowngrade(
          { ...reportedBasicDowngradeFixture, pendingPlanName: 'Starter Plan' },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('unverified');
      expect(
        service.evaluateScheduledDowngrade(
          { ...reportedBasicDowngradeFixture, pendingPlanName: 'Bas' },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('unverified');

      // Invalid/past date or different renewal date -> unverified
      expect(
        service.evaluateScheduledDowngrade(reportedBasicDowngradeFixture, {
          expectedSubscriptionId: 'sub_example',
          currentPriceId: 'price_current',
          targetPriceId: 'price_basic',
          targetPlanName: 'Basic Plan',
          targetTier: 'basic',
          expectedRenewalTimestamp: 1794566742,
          nowSeconds: 1794566742,
        })
      ).toBe('unverified');
      expect(
        service.evaluateScheduledDowngrade(
          { ...reportedBasicDowngradeFixture, pendingPeriodEnd: 1799999999 },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('unverified');

      // Contradictory schedule evidence -> unverified
      expect(
        service.evaluateScheduledDowngrade(
          {
            ...reportedBasicDowngradeFixture,
            schedule: { id: 'sub_sched_example', status: 'canceled' },
          },
          {
            expectedSubscriptionId: 'sub_example',
            currentPriceId: 'price_current',
            targetPriceId: 'price_basic',
            targetPlanName: 'Basic Plan',
            targetTier: 'basic',
            expectedRenewalTimestamp: 1794566742,
            nowSeconds: 1791900000,
          }
        )
      ).toBe('unverified');
    });
  });

  describe('setProviderTier', () => {
    it('should call setProviderTierFlow with new tier', async () => {
      runtimeConfig.updateConfig({ setProviderTierFlow: 'flow-set-tier' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      await service.setProviderTier('basic');

      expect(postSpy).toHaveBeenCalledWith('flow-set-tier', { tier: 'basic' });
    });
  });

  describe('Addon / Boost Flow Methods', () => {
    it('getAddonPrices should return filtered non-recurring active prices', async () => {
      runtimeConfig.updateConfig({ stripeGetAddonPricesFlow: 'flow-addon-prices' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'price_banner',
              product: { name: 'Main Banner', description: 'Hero banner placement' },
              unit_amount: 3000,
              currency: 'usd',
              active: true,
              recurring: null,
            },
            {
              id: 'price_hot',
              product: { name: 'What’s Hot', description: 'Hot highlight slot' },
              unit_amount: 1500,
              currency: 'usd',
              active: true,
              recurring: null,
            },
            {
              id: 'price_inactive',
              product: { name: 'Old Boost' },
              unit_amount: 1000,
              currency: 'usd',
              active: false,
            },
          ],
        },
      });

      const prices = await service.getAddonPrices();
      expect(prices.length).toBe(2);
      expect(prices[0].id).toBe('price_hot');
      expect(prices[0].amount).toBe(1500);
      expect(prices[1].id).toBe('price_banner');
      expect(prices[1].amount).toBe(3000);
    });

    it('getAddonPrices should throw if flowId is missing', async () => {
      runtimeConfig.updateConfig({ stripeGetAddonPricesFlow: '' });
      await expect(service.getAddonPrices()).rejects.toThrow(
        "We couldn't load promotion pricing. Please try again."
      );
    });

    it('getBoostAvailability should throw if flowId is missing', async () => {
      runtimeConfig.updateConfig({ getBoostAvailabilityFlow: '' });
      await expect(service.getBoostAvailability('area-123')).rejects.toThrow(
        'Boost availability flow is not configured.'
      );
    });

    it('getBoostAvailability should throw if areaId is missing or empty without calling flowPost', async () => {
      runtimeConfig.updateConfig({ getBoostAvailabilityFlow: 'flow-boost-avail' });
      const postSpy = vi.spyOn(service, 'flowPost');

      await expect(service.getBoostAvailability('')).rejects.toThrow(
        'A valid area identifier is required to check boost availability.'
      );
      await expect(service.getBoostAvailability('   ')).rejects.toThrow(
        'A valid area identifier is required to check boost availability.'
      );
      await expect(service.getBoostAvailability(null)).rejects.toThrow(
        'A valid area identifier is required to check boost availability.'
      );
      await expect(service.getBoostAvailability(undefined)).rejects.toThrow(
        'A valid area identifier is required to check boost availability.'
      );
      expect(postSpy).not.toHaveBeenCalled();
    });

    it('getBoostAvailability should throw if response format is invalid', async () => {
      runtimeConfig.updateConfig({ getBoostAvailabilityFlow: 'flow-boost-avail' });

      // Missing whatsHot
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        mainBanner: { count: 1, limit: 5 },
      });
      await expect(service.getBoostAvailability('area-123')).rejects.toThrow(
        'Boost availability response format is invalid.'
      );

      // Negative count
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        mainBanner: { count: -1, limit: 5 },
        whatsHot: { count: 0, limit: 10 },
      });
      await expect(service.getBoostAvailability('area-123')).rejects.toThrow(
        'Boost availability response format is invalid.'
      );

      // Zero or negative limit
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        mainBanner: { count: 0, limit: 0 },
        whatsHot: { count: 0, limit: 10 },
      });
      await expect(service.getBoostAvailability('area-123')).rejects.toThrow(
        'Boost availability response format is invalid.'
      );
    });

    it('getBoostAvailability should return counts, limits, and nextAvailableDate', async () => {
      runtimeConfig.updateConfig({ getBoostAvailabilityFlow: 'flow-boost-avail' });

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        mainBanner: { count: 3, limit: 5, nextAvailableDate: null },
        whatsHot: { count: 10, limit: 10, nextAvailableDate: '2026-10-12T00:00:00.000Z' },
      });

      const avail = await service.getBoostAvailability('area-123');
      expect(avail.mainBanner.count).toBe(3);
      expect(avail.mainBanner.limit).toBe(5);
      expect(avail.whatsHot.count).toBe(10);
      expect(avail.whatsHot.limit).toBe(10);
      expect(avail.whatsHot.nextAvailableDate).toBe('2026-10-12T00:00:00.000Z');
    });

    it('createAddonPayment should post correct payload to Directus flow', async () => {
      runtimeConfig.updateConfig({ stripeCreateAddonPaymentFlow: 'flow-create-addon-payment' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_client_secret: {
          clientSecret: 'pi_test_secret_boost',
          paymentIntentId: 'pi_test_123',
        },
      });

      const res = await service.createAddonPayment(
        'price_banner_1',
        'main_banner',
        'provider-abc',
        'event-xyz',
        '2026-10-15T12:00:00.000Z'
      );

      expect(postSpy).toHaveBeenCalledWith('flow-create-addon-payment', {
        priceId: 'price_banner_1',
        type: 'main_banner',
        providerId: 'provider-abc',
        eventId: 'event-xyz',
        scheduledStart: '2026-10-15T12:00:00.000Z',
        promotionCode: null,
      });
      expect((res as any).clientSecret).toBe('pi_test_secret_boost');
    });

    it('applyAddon should post payload to apply flow without writing directly to events table', async () => {
      runtimeConfig.updateConfig({ stripeApplyAddonFlow: 'flow-apply-addon' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({ success: true });

      await service.applyAddon('whats_hot', undefined, 'event-xyz', '2026-10-20T00:00:00.000Z');

      expect(postSpy).toHaveBeenCalledWith('flow-apply-addon', {
        type: 'whats_hot',
        internalDataId: null,
        eventId: 'event-xyz',
        scheduledStart: '2026-10-20T00:00:00.000Z',
      });
    });
  });

  describe('mountPaymentElement (Area 5)', () => {
    it('initializes Stripe elements with light theme matching portal tokens', async () => {
      const mockElement = { mount: vi.fn() };
      const mockElements = {
        create: vi.fn().mockReturnValue(mockElement),
      };
      const mockStripe = {
        elements: vi.fn().mockReturnValue(mockElements),
      };
      vi.spyOn(service, 'getStripe').mockResolvedValue(mockStripe as any);

      const container = document.createElement('div');
      container.id = 'stripe-test-container';
      document.body.appendChild(container);

      try {
        const res = await service.mountPaymentElement('pi_secret_123', 'stripe-test-container');
        expect(res.stripe).toBe(mockStripe);
        expect(mockStripe.elements).toHaveBeenCalledWith(
          expect.objectContaining({
            clientSecret: 'pi_secret_123',
            appearance: expect.objectContaining({
              theme: 'stripe',
              variables: expect.objectContaining({
                colorPrimary: '#8070C0',
                colorBackground: '#ffffff',
                colorText: '#0f172a',
                fontFamily: expect.stringContaining('Inter'),
              }),
            }),
          })
        );
        expect(mockElements.create).toHaveBeenCalledWith('payment');
        expect(mockElement.mount).toHaveBeenCalledWith(container);
      } finally {
        container.remove();
      }
    });

    it('mountCardSetupElement and cleanupCardSetup keep standalone card setup Elements isolated from subscription checkout Elements', async () => {
      const checkoutElement = { mount: vi.fn(), destroy: vi.fn() };
      const cardSetupElement = { mount: vi.fn(), destroy: vi.fn() };
      const checkoutElements = { create: vi.fn().mockReturnValue(checkoutElement) };
      const setupElements = { create: vi.fn().mockReturnValue(cardSetupElement) };

      const mockStripe = {
        elements: vi
          .fn()
          .mockReturnValueOnce(checkoutElements)
          .mockReturnValueOnce(setupElements),
      };
      vi.spyOn(service, 'getStripe').mockResolvedValue(mockStripe as any);

      const checkoutContainer = document.createElement('div');
      checkoutContainer.id = 'portal-payment-element';
      const setupContainer = document.createElement('div');
      setupContainer.id = 'portal-card-setup-element';
      document.body.appendChild(checkoutContainer);
      document.body.appendChild(setupContainer);

      try {
        await service.mountPaymentElement('pi_secret_checkout', 'portal-payment-element');
        await service.mountCardSetupElement('seti_secret_card', 'portal-card-setup-element');

        expect((service as any).activeElements).toBe(checkoutElements);
        expect((service as any).cardSetupElements).toBe(setupElements);

        // Cleaning up standalone card setup must not clear subscription checkout activeElements
        service.cleanupCardSetup();
        expect(cardSetupElement.destroy).toHaveBeenCalledTimes(1);
        expect((service as any).cardSetupElements).toBeNull();
        expect((service as any).activeElements).toBe(checkoutElements);

        // Cleaning up checkout must not throw or corrupt state
        service.cleanup();
        expect((service as any).activeElements).toBeNull();
      } finally {
        checkoutContainer.remove();
        setupContainer.remove();
      }
    });
  });

  describe('Standalone Credit-Card Management Flows', () => {
    it('loadSavedPaymentMethods does not infer default card from list order when defaultPaymentMethodId is absent', async () => {
      runtimeConfig.updateConfig({ stripeGetPaymentMethodsFlow: 'flow-get-pms' });
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        paymentMethods: [
          { id: 'pm_first', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 },
          { id: 'pm_second', brand: 'mastercard', last4: '5555', expMonth: 6, expYear: 2029 },
        ],
      });

      const res = await service.loadSavedPaymentMethods();
      expect(res.defaultVerified).toBe(false);
      expect(res.defaultPaymentMethodId).toBeNull();
      expect(res.paymentMethods[0].isRenewalCard).toBeUndefined();
      expect(res.paymentMethods[1].isRenewalCard).toBeUndefined();
    });

    it('loadSavedPaymentMethods marks only the verified defaultPaymentMethodId as renewal card', async () => {
      runtimeConfig.updateConfig({ stripeGetPaymentMethodsFlow: 'flow-get-pms' });
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        paymentMethods: [
          { id: 'pm_first', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 },
          { id: 'pm_second', brand: 'mastercard', last4: '5555', expMonth: 6, expYear: 2029 },
        ],
        defaultPaymentMethodId: 'pm_second',
      });

      const res = await service.loadSavedPaymentMethods();
      expect(res.defaultVerified).toBe(true);
      expect(res.defaultPaymentMethodId).toBe('pm_second');
      expect(res.paymentMethods[0].isRenewalCard).toBe(false);
      expect(res.paymentMethods[1].isRenewalCard).toBe(true);
    });

    it('createCardSetupIntent requests a SetupIntent without client-supplied customerId and deduplicates in-flight calls', async () => {
      runtimeConfig.updateConfig({ stripeCreateSetupIntentFlow: 'flow-create-si' });
      let resolvePost!: (val: any) => void;
      const postSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        })
      );

      const p1 = service.createCardSetupIntent();
      const p2 = service.createCardSetupIntent();
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('flow-create-si', {});

      resolvePost({
        setupIntentId: 'seti_12345',
        clientSecret: 'seti_12345_secret_abc',
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual({
        setupIntentId: 'seti_12345',
        clientSecret: 'seti_12345_secret_abc',
      });
      expect(r2).toEqual(r1);
    });

    it('finalizeCardSetup verifies succeeded SetupIntent and attached payment method on backend', async () => {
      runtimeConfig.updateConfig({ stripeFinalizeSetupIntentFlow: 'flow-finalize-si' });
      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        verified: true,
        setupIntentId: 'seti_12345',
        status: 'succeeded',
        paymentMethodId: 'pm_new_99',
        paymentMethod: {
          id: 'pm_new_99',
          brand: 'visa',
          last4: '1111',
          expMonth: 10,
          expYear: 2030,
        },
      });

      const res = await service.finalizeCardSetup('seti_12345');
      expect(postSpy).toHaveBeenCalledWith('flow-finalize-si', { setupIntentId: 'seti_12345' });
      expect(res.verified).toBe(true);
      expect(res.paymentMethodId).toBe('pm_new_99');
      expect(res.paymentMethod?.last4).toBe('1111');
    });

    it('finalizeCardSetup rejects unverified or non-succeeded SetupIntent', async () => {
      runtimeConfig.updateConfig({ stripeFinalizeSetupIntentFlow: 'flow-finalize-si' });
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        verified: false,
        error: true,
        status: 'requires_payment_method',
        message: 'Card setup has not succeeded.',
      });

      await expect(service.finalizeCardSetup('seti_failed')).rejects.toThrow(
        'Card setup has not succeeded.'
      );
    });

    it('setDefaultPaymentMethod updates customer and active subscription default payment method and deduplicates concurrent requests', async () => {
      runtimeConfig.updateConfig({ stripeSetDefaultPaymentMethodFlow: 'flow-set-default' });
      let resolvePost!: (val: any) => void;
      const postSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        })
      );

      const p1 = service.setDefaultPaymentMethod('pm_new_99', 'sub_active_1');
      const p2 = service.setDefaultPaymentMethod('pm_new_99', 'sub_active_1');
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('flow-set-default', {
        paymentMethodId: 'pm_new_99',
        subscriptionId: 'sub_active_1',
      });

      resolvePost({
        updated: true,
        defaultPaymentMethodId: 'pm_new_99',
        customerDefaultUpdated: true,
        subscriptionDefaultUpdated: true,
        subscriptionId: 'sub_active_1',
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.updated).toBe(true);
      expect(r1.defaultPaymentMethodId).toBe('pm_new_99');
      expect(r2).toEqual(r1);
    });

    it('detachPaymentMethod surfaces RENEWAL_CARD_PROTECTED error when backend blocks detaching active renewal card', async () => {
      runtimeConfig.updateConfig({ stripeDetachPaymentMethodFlow: 'flow-detach-pm' });
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        detached: false,
        error: true,
        code: 'RENEWAL_CARD_PROTECTED',
        message: 'Cannot remove active renewal card.',
      });

      await expect(service.detachPaymentMethod('pm_renewal')).rejects.toMatchObject({
        code: 'RENEWAL_CARD_PROTECTED',
      });
    });
  });
});

