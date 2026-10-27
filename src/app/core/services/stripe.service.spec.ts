import { TestBed } from '@angular/core/testing';
import { StripeService, StripePlan } from './stripe.service';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { runtimeConfig, DEV_DIRECTUS_CARD_FLOWS } from '../config/runtime-config';

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

    it('wires verified development Directus flow IDs when targeting quepasa-api.c1oud7.de while keeping production unpopulated', () => {
      runtimeConfig.reset();
      expect(runtimeConfig.directusUrl).toBe('https://api.vamo-app.com');
      expect(runtimeConfig.stripeCreateSetupIntentFlow).toBe('');
      expect(runtimeConfig.stripeFinalizeSetupIntentFlow).toBe('');
      expect(runtimeConfig.stripeSetDefaultPaymentMethodFlow).toBe('');

      runtimeConfig.setDirectusUrl('https://quepasa-api.c1oud7.de');
      expect(runtimeConfig.directusUrl).toBe('https://quepasa-api.c1oud7.de');
      expect(runtimeConfig.stripeCreateSetupIntentFlow).toBe(
        DEV_DIRECTUS_CARD_FLOWS.stripeCreateSetupIntentFlow
      );
      expect(runtimeConfig.stripeFinalizeSetupIntentFlow).toBe(
        DEV_DIRECTUS_CARD_FLOWS.stripeFinalizeSetupIntentFlow
      );
      expect(runtimeConfig.stripeSetDefaultPaymentMethodFlow).toBe(
        DEV_DIRECTUS_CARD_FLOWS.stripeSetDefaultPaymentMethodFlow
      );
      expect(runtimeConfig.stripeGetPaymentMethodsFlow).toBe(
        DEV_DIRECTUS_CARD_FLOWS.stripeGetPaymentMethodsFlow
      );
      expect(runtimeConfig.stripeDetachPaymentMethodFlow).toBe(
        DEV_DIRECTUS_CARD_FLOWS.stripeDetachPaymentMethodFlow
      );

      runtimeConfig.setDirectusUrl('https://api.vamo-app.com');
      expect(runtimeConfig.stripeCreateSetupIntentFlow).toBe('');
      expect(runtimeConfig.stripeFinalizeSetupIntentFlow).toBe('');
      expect(runtimeConfig.stripeSetDefaultPaymentMethodFlow).toBe('');
    });
  });

  describe('Unified Directus Stripe Checkout & Charge Protection', () => {
    beforeEach(() => {
      runtimeConfig.updateConfig({
        stripeGetPricesFlow: 'ccd7ae9c-27be-453e-94ef-db7d52be0e0a',
        stripeValidatePromoFlow: '3b580ce9-5023-446f-ad4c-55c8ee5db4fd',
        stripeCreateSubscriptionFlow: '0a31e459-0909-41b0-8286-2aecc763fe29',
        stripeCreateSubscriptionFromSetupFlow: '442c21fa-eca5-4c54-bc34-f7e77465343f',
        stripeGetSubscriptionFlow: 'a48e3dee-3d94-471b-804f-16ada69737cf',
        stripeCancelSubscriptionFlow: 'flow-cancel-sub',
      });
    });

    it('previewSubscriptionCheckout calls Directus stripeValidatePromoFlow and computes verified $0.00 preview for valid 100%-off promo', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          promoCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
          name: 'LT Founders club',
          percentOff: 100,
          duration: 'repeating',
          durationInMonths: 3,
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'adminapple@admin.com',
        priceId: 'price_basic_59',
        planName: 'Basic Plan',
        planAmount: 5900,
        planCurrency: 'usd',
        planInterval: 'month',
        promotionCode: 'FOUNDERS90',
      });

      expect(flowSpy).toHaveBeenCalledWith(
        '3b580ce9-5023-446f-ad4c-55c8ee5db4fd',
        {
          code: 'FOUNDERS90',
        },
      );
      expect(preview.verified).toBe(true);
      expect(preview.verificationStatus).toBe('verified');
      expect(preview.couponState).toBe('verified_applied');
      expect(preview.subtotal).toBe(5900);
      expect(preview.discountAmount).toBe(5900);
      expect(preview.amountDueToday).toBe(0);
      expect(preview.renewalAmount).toBe(5900);
      expect(preview.promoCodeId).toBe('promo_1UKiYz2aqrJCvAj3rpoKa3Kf');
      expect(preview.couponDuration).toBe('repeating');
      expect(preview.couponDurationInMonths).toBe(3);
      expect(preview.verificationReference).toBeTruthy();
    });

    it('previewSubscriptionCheckout returns verified preview for valid partial coupon (e.g. $20 off)', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          promoCodeId: 'promo_save20',
          name: '$20 Off First Month',
          amountOff: 2000,
          currency: 'usd',
          duration: 'once',
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        promotionCode: 'SAVE20',
      });

      expect(preview.verified).toBe(true);
      expect(preview.couponState).toBe('verified_applied');
      expect(preview.amountDueToday).toBe(3900);
      expect(preview.discountAmount).toBe(2000);
      expect(preview.couponDuration).toBe('once');
    });

    it('previewSubscriptionCheckout never accepts bare coupon metadata without an authoritative plan subtotal or promoCodeId', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          name: 'Missing Promo ID',
          percentOff: 100,
          duration: 'once',
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'adminapple@admin.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        promotionCode: 'FOUNDERS90',
      });

      expect(preview.verified).toBe(false);
      expect(preview.verificationStatus).toBe('unavailable');
      expect(preview.couponState).toBe('verification_unavailable');
      expect(preview.verificationReference).toBeNull();
    });

    it('previewSubscriptionCheckout marks expired, exhausted, customer-restricted, or product-ineligible coupons as invalid_or_ineligible', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: false,
          code: 'PROMOTION_EXPIRED',
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        promotionCode: 'EXPIRED99',
      });

      expect(preview.verified).toBe(false);
      expect(preview.couponState).toBe('invalid_or_ineligible');
    });

    it('CRITICAL ACCEPTANCE TEST: Given a customer who approved a $0.00 checkout, if subscription creation returns a chargeable pi_ PaymentIntent, checkout stops immediately without collecting $59', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_oct19_incident',
          clientSecret: 'pi_3Oct19_secret_bad',
          requiresSetup: false,
          invoiceAmountDue: 5900,
          invoiceCurrency: 'usd',
        },
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'adminapple@admin.com',
          name: 'Admin Apple',
          priceId: 'price_basic_59',
          promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
          approvedAmountDue: 0,
          approvedCurrency: 'usd',
          verificationReference: 'vref_2_approved_zero',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'UNEXPECTED_PAYMENT_INTENT_FOR_FREE_CHECKOUT',
        approvedAmount: 0,
        actualAmount: 5900,
      });

      expect(flowSpy).toHaveBeenCalledWith(
        '0a31e459-0909-41b0-8286-2aecc763fe29',
        expect.objectContaining({
          email: 'adminapple@admin.com',
          name: 'Admin Apple',
          priceId: 'price_basic_59',
          promotionCode: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        }),
      );
    });

    it('createVerifiedSubscription blocks via stripe.retrievePaymentIntent when PaymentIntent amount exceeds approved amount (e.g. approved $29.50, PI is $59.00)', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_mismatch_1',
          clientSecret: 'pi_3Mismatch_secret_xyz',
          requiresSetup: false,
        },
      });
      vi.spyOn(service as any, 'getStripe').mockResolvedValue({
        retrievePaymentIntent: vi.fn().mockResolvedValue({
          paymentIntent: {
            id: 'pi_3Mismatch',
            amount: 5900,
            currency: 'usd',
            status: 'requires_payment_method',
          },
        }),
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: 'promo_half_off',
          approvedAmountDue: 2950,
          approvedCurrency: 'usd',
          verificationReference: 'vref_2_approved_2950',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'AMOUNT_MISMATCH_BLOCKED',
        approvedAmount: 2950,
        actualAmount: 5900,
      });
    });

    it('createVerifiedSubscription blocks when PaymentIntent cannot be verified via Stripe.js retrievePaymentIntent', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_legacy_1',
          clientSecret: 'pi_3Legacy_secret_xyz',
          requiresSetup: false,
        },
      });
      vi.spyOn(service as any, 'getStripe').mockResolvedValue({
        retrievePaymentIntent: vi.fn().mockResolvedValue({
          error: { message: 'Could not retrieve PaymentIntent' },
        }),
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: null,
          approvedAmountDue: 5900,
          approvedCurrency: 'usd',
          verificationReference: 'vref_2_approved_5900',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'MISSING_INVOICE_VERIFICATION',
      });
    });

    it('createVerifiedSubscription blocks on currency mismatch between approved preview and retrieved PaymentIntent', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_curr_1',
          clientSecret: 'pi_3Curr_secret_xyz',
          requiresSetup: false,
        },
      });
      vi.spyOn(service as any, 'getStripe').mockResolvedValue({
        retrievePaymentIntent: vi.fn().mockResolvedValue({
          paymentIntent: {
            id: 'pi_3Curr',
            amount: 5900,
            currency: 'eur',
            status: 'requires_payment_method',
          },
        }),
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: null,
          approvedAmountDue: 5900,
          approvedCurrency: 'usd',
          verificationReference: 'vref_2_approved_5900',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'CURRENCY_MISMATCH_BLOCKED',
      });
    });

    it('createVerifiedSubscription allows verified $0.00 checkout when SetupIntent (requiresSetup: true, seti_ secret, setupIntentId, no premature subscriptionId) is returned', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: null,
          setupIntentId: 'seti_1ZeroOk',
          clientSecret: 'seti_1ZeroOk_secret_safe',
          requiresSetup: true,
        },
      });

      const res = await service.createVerifiedSubscription({
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_59',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: 'vref_2_approved_zero',
      });

      expect(res.subscriptionId).toBe('');
      expect(res.setupIntentId).toBe('seti_1ZeroOk');
      expect(res.clientSecret).toBe('seti_1ZeroOk_secret_safe');
      expect(res.requiresSetup).toBe(true);
      expect(res.invoiceAmountDue).toBe(0);
      expect(res.appliedPromotionCodeId).toBe('promo_1UKiYz2aqrJCvAj3rpoKa3Kf');
      expect(res.verifiedByServer).toBe(true);
    });

    it('createVerifiedSubscription blocks $0.00 checkout if a subscription was prematurely created before SetupIntent card confirmation', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_premature_123',
          setupIntentId: 'seti_1ZeroBad',
          clientSecret: 'seti_1ZeroBad_secret_safe',
          requiresSetup: true,
        },
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'adminapple@admin.com',
          name: 'Admin Apple',
          priceId: 'price_basic_59',
          promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
          approvedAmountDue: 0,
          approvedCurrency: 'usd',
          verificationReference: 'vref_2_approved_zero',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'UNEXPECTED_PRE_VERIFICATION_CHARGE',
      });
    });

    it('createSubscriptionFromSetup calls Directus flow 442c21fa-eca5-4c54-bc34-f7e77465343f with { setupIntentId } and returns { subscriptionId }', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_created_after_setup_99',
        },
      });

      const res = await service.createSubscriptionFromSetup('seti_1ZeroOk');
      expect(flowSpy).toHaveBeenCalledWith('442c21fa-eca5-4c54-bc34-f7e77465343f', {
        setupIntentId: 'seti_1ZeroOk',
      });
      expect(res.subscriptionId).toBe('sub_created_after_setup_99');
    });

    it('createSubscriptionFromSetup rejects non-seti_ setupIntentId or missing sub_ subscriptionId in response', async () => {
      await expect(service.createSubscriptionFromSetup('pi_invalid')).rejects.toThrow(
        'Invalid SetupIntent identifier. Cannot start subscription without a verified card setup.',
      );

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: { subscriptionId: '' },
      });
      await expect(service.createSubscriptionFromSetup('seti_1ZeroOk')).rejects.toThrow(
        'Subscription activation could not be verified: missing subscriptionId from SetupIntent flow.',
      );
    });

    it('CheckoutAuditService records checkout events and redacts card numbers, CVCs, expiry dates, client secrets, tokens, and email addresses', () => {
      (service as any).auditService.record('setup_intent_confirmed', {
        priceId: 'price_basic_59',
        promotionCode: 'APPLE',
        promotionCodeId: 'promo_apple_100',
        setupIntentId: 'seti_1ZeroOk',
        approvedAmount: 0,
        actualAmount: 0,
        currency: 'usd',
        reason:
          'Card 4242424242424242 exp 12/28 email adminapple@admin.com secret seti_1ZeroOk_secret_sensitive123 token Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
      });

      const events = (service as any).auditService.getEntries();
      const latest = events[events.length - 1];
      expect(latest.event).toBe('setup_intent_confirmed');
      expect(latest.setupIntentId).toBe('seti_1ZeroOk');
      expect(latest.reason).not.toContain('4242424242424242');
      expect(latest.reason).not.toContain('12/28');
      expect(latest.reason).not.toContain('adminapple@admin.com');
      expect(latest.reason).not.toContain('_secret_sensitive123');
      expect(latest.reason).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('marks client-calculated previews as isEstimated=true (amountSource=client_estimate, serverAuthenticatedReference=false) and never emits invoice_preview_created without a server invoice preview', async () => {
      (service as any).auditService.clear();
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          promoCodeId: 'promo_half_off',
          name: 'HALF50',
          percentOff: 50,
          duration: 'once',
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        promotionCode: 'HALF50',
      });

      expect(preview.verified).toBe(true);
      expect(preview.isEstimated).toBe(true);
      expect(preview.amountSource).toBe('client_estimate');
      expect(preview.eligibilityVerified).toBe(false);
      expect(preview.serverAuthenticatedReference).toBe(false);

      const events = (service as any).auditService.getEntries().map((e: any) => e.event);
      expect(events).not.toContain('invoice_preview_created');
      expect(events).toContain('amount_displayed_for_approval');
    });

    it('rejects coupon when product restriction (appliesToProducts / applies_to.products) is present but request.productId is missing or mismatched', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          promoCodeId: 'promo_adv_only',
          name: 'ADVONLY',
          percentOff: 50,
          duration: 'once',
          applies_to: { products: ['prod_advanced_only'] },
        },
      });

      const previewMissingProduct = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        promotionCode: 'ADVONLY',
      });

      expect(previewMissingProduct.verified).toBe(false);
      expect(previewMissingProduct.couponState).toBe('invalid_or_ineligible');
      expect(previewMissingProduct.errorCode).toBe('PRODUCT_RESTRICTION_MISMATCH');
    });

    it('rejects forged or unrecorded client-generated dref_ / local_est_ verification references in createVerifiedSubscription', async () => {
      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: 'promo_half_off',
          approvedAmountDue: 2950,
          approvedCurrency: 'usd',
          verificationReference: 'dref_price_basic_59_promo_half_off_2950_usd_9999999999999',
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'UNVERIFIED_CHECKOUT',
      });
    });

    it('blocks checkout before card confirmation when coupon appeared valid during preview but subscription creation rejects it or returns full-price PaymentIntent', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_promo: {
          valid: true,
          promoCodeId: 'promo_ineligible_at_sub',
          name: 'HALF50',
          percentOff: 50,
          duration: 'once',
        },
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        promotionCode: 'HALF50',
      });
      expect(preview.amountDueToday).toBe(2950);

      // Case 1: Subscription creation flow rejects the promotion
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          errorCode: 'PROMOTION_NO_LONGER_ELIGIBLE',
          message: 'Promotion code is not eligible for this customer.',
        },
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: preview.promoCodeId,
          approvedAmountDue: preview.amountDueToday,
          approvedCurrency: preview.currency,
          verificationReference: preview.verificationReference!,
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'PROMO_NOT_APPLIED',
      });

      // Case 2: Subscription creation flow silently drops coupon and returns a full-price $59.00 PaymentIntent
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        extract_result: {
          subscriptionId: 'sub_full_price_99',
          clientSecret: 'pi_3FullPrice_secret_123',
          requiresSetup: false,
        },
      });
      vi.spyOn(service as any, 'getStripe').mockResolvedValue({
        retrievePaymentIntent: vi.fn().mockResolvedValue({
          paymentIntent: {
            id: 'pi_3FullPrice',
            amount: 5900,
            currency: 'usd',
            status: 'requires_payment_method',
          },
        }),
      });

      await expect(
        service.createVerifiedSubscription({
          email: 'sofia@restaurant.com',
          name: 'Sofia',
          priceId: 'price_basic_59',
          promotionCodeId: preview.promoCodeId,
          approvedAmountDue: preview.amountDueToday,
          approvedCurrency: preview.currency,
          verificationReference: preview.verificationReference!,
        }),
      ).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'AMOUNT_MISMATCH_BLOCKED',
        approvedAmount: 2950,
        actualAmount: 5900,
      });
    });

    it('allows checkout to proceed when customer approves a discounted paid amount and retrieved PaymentIntent amount matches', async () => {
      vi.spyOn(service, 'flowPost')
        .mockResolvedValueOnce({
          extract_promo: {
            valid: true,
            promoCodeId: 'promo_half_off',
            name: 'HALF50',
            percentOff: 50,
            duration: 'once',
          },
        })
        .mockResolvedValueOnce({
          extract_result: {
            subscriptionId: 'sub_discounted_ok',
            clientSecret: 'pi_3DiscountOk_secret_abc',
            requiresSetup: false,
          },
        });

      vi.spyOn(service as any, 'getStripe').mockResolvedValue({
        retrievePaymentIntent: vi.fn().mockResolvedValue({
          paymentIntent: {
            id: 'pi_3DiscountOk',
            amount: 2950,
            currency: 'usd',
            status: 'requires_payment_method',
          },
        }),
      });

      const preview = await service.previewSubscriptionCheckout({
        customerEmail: 'sofia@restaurant.com',
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        promotionCode: 'HALF50',
      });

      const res = await service.createVerifiedSubscription({
        email: 'sofia@restaurant.com',
        name: 'Sofia',
        priceId: 'price_basic_59',
        promotionCodeId: preview.promoCodeId,
        approvedAmountDue: preview.amountDueToday,
        approvedCurrency: preview.currency,
        verificationReference: preview.verificationReference!,
      });

      expect(res.subscriptionId).toBe('sub_discounted_ok');
      expect(res.invoiceAmountDue).toBe(2950);
      expect(res.requiresSetup).toBe(false);
    });

    it('deduplicates concurrent createVerifiedSubscription calls so only one subscription creation request is sent', async () => {
      let resolveFlow!: (val: any) => void;
      const flowSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(
        new Promise((res) => {
          resolveFlow = res;
        }),
      );

      const req = {
        email: 'adminapple@admin.com',
        name: 'Admin Apple',
        priceId: 'price_basic_59',
        promotionCodeId: 'promo_1UKiYz2aqrJCvAj3rpoKa3Kf',
        approvedAmountDue: 0,
        approvedCurrency: 'usd',
        verificationReference: 'vref_concurrent_zero',
      };

      const p1 = service.createVerifiedSubscription(req);
      const p2 = service.createVerifiedSubscription(req);
      expect(flowSpy).toHaveBeenCalledTimes(1);

      resolveFlow({
        extract_result: {
          subscriptionId: null,
          setupIntentId: 'seti_Concurrent1',
          clientSecret: 'seti_Concurrent1_secret_xyz',
          requiresSetup: true,
        },
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.setupIntentId).toBe('seti_Concurrent1');
      expect(r2.setupIntentId).toBe('seti_Concurrent1');
    });

    it('checks subscription status via getSubscription before allowing retry after an uncertain network/flow error and blocks duplicate subscription creation if one already exists', async () => {
      const flowSpy = vi
        .spyOn(service, 'flowPost')
        .mockRejectedValueOnce(new Error('Network timeout during subscription creation'));

      const getSubSpy = vi.spyOn(service, 'getSubscription').mockResolvedValueOnce({
        subscriptionId: 'sub_already_created_on_server',
        subscriptionItemId: 'si_1',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        plan: {
          priceId: 'price_basic_59',
          productName: 'Basic Plan',
          amount: 5900,
          currency: 'usd',
          interval: 'month',
        },
      });

      const req = {
        email: 'sofia@restaurant.com',
        name: 'Sofia',
        priceId: 'price_basic_59',
        promotionCodeId: null,
        approvedAmountDue: 5900,
        approvedCurrency: 'usd',
        verificationReference: 'vref_uncertain_retry',
      };

      // First call fails with uncertain network timeout
      await expect(service.createVerifiedSubscription(req)).rejects.toThrow(
        'Network timeout during subscription creation',
      );

      // Retry must reconcile via getSubscription first and block creating a duplicate subscription
      await expect(service.createVerifiedSubscription(req)).rejects.toMatchObject({
        name: 'CheckoutChargeProtectionError',
        code: 'UNEXPECTED_PRE_VERIFICATION_CHARGE',
      });

      expect(getSubSpy).toHaveBeenCalledWith('sofia@restaurant.com');
      // stripeCreateSubscriptionFlow was only called once (not a second time!)
      expect(flowSpy).toHaveBeenCalledTimes(1);
    });

    it('reconciles via getSubscription after an uncertain createSubscriptionFromSetup error and returns the existing subscription without calling 442c21fa a second time', async () => {
      const flowSpy = vi
        .spyOn(service, 'flowPost')
        .mockRejectedValueOnce(new Error('Network drop after SetupIntent completion'));

      const getSubSpy = vi.spyOn(service, 'getSubscription').mockResolvedValueOnce({
        subscriptionId: 'sub_from_setup_reconciled',
        subscriptionItemId: 'si_setup_1',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        plan: {
          priceId: 'price_basic_59',
          productName: 'Basic Plan',
          amount: 5900,
          currency: 'usd',
          interval: 'month',
        },
      });

      await expect(
        service.createSubscriptionFromSetup('seti_Uncertain1', 'adminapple@admin.com'),
      ).rejects.toThrow('Network drop after SetupIntent completion');

      const retryRes = await service.createSubscriptionFromSetup(
        'seti_Uncertain1',
        'adminapple@admin.com',
      );
      expect(retryRes).toEqual({ subscriptionId: 'sub_from_setup_reconciled' });
      expect(getSubSpy).toHaveBeenCalledWith('adminapple@admin.com');
      expect(flowSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Billing History & Receipt Amount Formatting (Directus major-unit contract)', () => {
    it('returns major-unit billing history items from STRIPE_GET_BILLING_HISTORY_FLOW without dividing by 100 a second time', async () => {
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        history: [
          {
            id: 'in_59',
            type: 'subscription',
            label: 'Basic Plan',
            amount: 59,
            currency: 'usd',
            date: 1700000000,
            status: 'paid',
            invoice_pdf: 'https://stripe.com/in_59.pdf',
            hosted_invoice_url: 'https://stripe.com/in_59',
          },
          {
            id: 'in_31',
            type: 'subscription',
            label: 'Starter Plan',
            amount: 31,
            currency: 'usd',
            date: 1700000100,
            status: 'paid',
            invoice_pdf: null,
            hosted_invoice_url: 'https://stripe.com/in_31',
          },
          {
            id: 'in_30',
            type: 'subscription',
            label: 'Starter Plan Promo',
            amount: 30,
            currency: 'usd',
            date: 1700000200,
            status: 'paid',
            invoice_pdf: null,
            hosted_invoice_url: 'https://stripe.com/in_30',
          },
          {
            id: 'in_23',
            type: 'addon',
            label: 'Single Post Add-On',
            amount: 23,
            currency: 'usd',
            date: 1700000300,
            status: 'paid',
            invoice_pdf: null,
            hosted_invoice_url: 'https://stripe.com/in_23',
          },
        ],
      });

      const history = await service.getBillingHistory();
      expect(history.map((item) => item.amount)).toEqual([59, 31, 30, 23]);
      expect(history.map((item) => service.formatBillingHistoryAmount(item.amount, item.currency))).toEqual([
        '$59.00',
        '$31.00',
        '$30.00',
        '$23.00',
      ]);
    });

    it('1. formats a $59.00 receipt correctly (not $0.59)', () => {
      expect(service.formatBillingHistoryAmount(59, 'usd')).toBe('$59.00');
    });

    it('2. formats a $31.00 receipt correctly (not $0.31)', () => {
      expect(service.formatBillingHistoryAmount(31, 'usd')).toBe('$31.00');
    });

    it('3. formats a $30.00 receipt correctly (not $0.30)', () => {
      expect(service.formatBillingHistoryAmount(30, 'usd')).toBe('$30.00');
    });

    it('4. formats a $23.00 receipt correctly (not $0.23)', () => {
      expect(service.formatBillingHistoryAmount(23, 'usd')).toBe('$23.00');
    });

    it('5. formats a $0.00 invoice correctly', () => {
      expect(service.formatBillingHistoryAmount(0, 'usd')).toBe('$0.00');
      expect(service.formatBillingHistoryAmount(-0, 'usd')).toBe('$0.00');
    });

    it('6. formats fractional-dollar receipt amounts accurately without magnitude heuristics', () => {
      expect(service.formatBillingHistoryAmount(29.5, 'usd')).toBe('$29.50');
      expect(service.formatBillingHistoryAmount(14.75, 'usd')).toBe('$14.75');
      expect(service.formatBillingHistoryAmount(0.5, 'usd')).toBe('$0.50');
      expect(service.formatBillingHistoryAmount(1, 'usd')).toBe('$1.00');
      expect(service.formatBillingHistoryAmount(99, 'usd')).toBe('$99.00');
    });

    it('7. formats negative / refund amounts safely', () => {
      expect(service.formatBillingHistoryAmount(-23, 'usd')).toBe('-$23.00');
      expect(service.formatBillingHistoryAmount(-14.75, 'usd')).toBe('-$14.75');
    });

    it('8. always formats USD billing-history amounts to two decimal places', () => {
      expect(service.formatBillingHistoryAmount(59, 'USD')).toBe('$59.00');
      expect(service.formatBillingHistoryAmount(31, 'usd')).toBe('$31.00');
      expect(service.formatBillingHistoryAmount(30, '')).toBe('$30.00');
      expect(service.formatBillingHistoryAmount(0, 'usd')).toBe('$0.00');
    });

    it('9. preserves minor-unit subscription plan price formatting in formatPrice()', () => {
      expect(service.formatPrice(2900, 'usd')).toBe('$29');
      expect(service.formatPrice(4900, 'usd')).toBe('$49');
      expect(service.formatPrice(5900, 'usd')).toBe('$59');
      expect(service.formatPrice(8900, 'usd')).toBe('$89');
    });

    it('10. preserves minor-unit checkout calculations and formatExactPrice()', async () => {
      expect(service.formatExactPrice(5900, 'usd')).toBe('$59.00');
      expect(service.formatExactPrice(3100, 'usd')).toBe('$31.00');
      expect(service.formatExactPrice(0, 'usd')).toBe('$0.00');

      const preview = await service.previewSubscriptionCheckout({
        priceId: 'price_basic_59',
        planAmount: 5900,
        planCurrency: 'usd',
        planInterval: 'month',
        planName: 'Basic Plan',
        customerEmail: 'business@example.com',
      });
      expect(preview.subtotal).toBe(5900);
      expect(preview.amountDueToday).toBe(5900);
      expect(service.formatExactPrice(preview.amountDueToday, preview.currency)).toBe('$59.00');
    });
  });

  describe('Single-Post Add-On Directus Flows', () => {
    it('fetches add-on prices from STRIPE_GET_ADDON_PRICES_FLOW and maps single-post add-on', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        data: [
          {
            id: 'price_1TBzCXGWvZAV5mbnFwGJZ73E',
            active: true,
            unit_amount: 2000,
            currency: 'usd',
            product: {
              name: 'Single post add on',
              description: 'Add a single post to your subscription, valid for 30 days',
            },
          },
        ],
      });

      const prices = await service.getAddonPrices();
      expect(flowSpy).toHaveBeenCalledWith('0734bb3c-123d-41a0-b33f-1c31bd5d149a', {});
      expect(prices).toEqual([
        {
          id: 'price_1TBzCXGWvZAV5mbnFwGJZ73E',
          name: 'Single post add on',
          description: 'Add a single post to your subscription, valid for 30 days',
          amount: 2000,
          currency: 'usd',
          interval: 'one_time',
          productName: 'Single post add on',
        },
      ]);
    });

    it('creates a single_post add-on PaymentIntent via STRIPE_CREATE_ADDON_PAYMENT_FLOW and deduplicates in-flight calls', async () => {
      let resolveFlow!: (value: any) => void;
      const flowPromise = new Promise((r) => {
        resolveFlow = r;
      });
      const flowSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(flowPromise);

      const p1 = service.createAddonPayment(
        'price_1TBzCXGWvZAV5mbnFwGJZ73E',
        'single_post',
        'prov-1',
      );
      const p2 = service.createAddonPayment(
        'price_1TBzCXGWvZAV5mbnFwGJZ73E',
        'single_post',
        'prov-1',
      );

      expect(flowSpy).toHaveBeenCalledTimes(1);
      expect(flowSpy).toHaveBeenCalledWith('44b702ee-4d0f-4964-95bd-1cee6fe043cf', {
        priceId: 'price_1TBzCXGWvZAV5mbnFwGJZ73E',
        type: 'single_post',
        providerId: 'prov-1',
        eventId: null,
        scheduledStart: null,
        promotionCode: null,
      });

      resolveFlow({
        extract_addon_secret: {
          clientSecret: 'pi_single_post_secret_123',
          paymentIntentId: 'pi_single_post',
          free: false,
        },
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toEqual({
        clientSecret: 'pi_single_post_secret_123',
        paymentIntentId: 'pi_single_post',
        free: false,
      });
      expect(res2).toEqual(res1);
    });

    it('applies single_post add-on via STRIPE_APPLY_ADDON_FLOW with exact VAMO payload and deduplicates in-flight calls', async () => {
      let resolveFlow!: (value: any) => void;
      const flowPromise = new Promise((r) => {
        resolveFlow = r;
      });
      const flowSpy = vi.spyOn(service, 'flowPost').mockReturnValueOnce(flowPromise);

      const p1 = service.applyAddon('single_post');
      const p2 = service.applyAddon('single_post');

      expect(flowSpy).toHaveBeenCalledTimes(1);
      expect(flowSpy).toHaveBeenCalledWith('b3fc61a0-fba9-4acd-a918-5d4665c64154', {
        type: 'single_post',
        internalDataId: null,
        eventId: null,
        scheduledStart: null,
      });

      resolveFlow({ success: true });
      await Promise.all([p1, p2]);
    });

    it('fetches extra_posts from PROVIDER_GET_QUOTA_FLOW', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({ extra_posts: 2 });
      const extra = await service.getExtraPosts();
      expect(flowSpy).toHaveBeenCalledWith('d89e5fbc-f47d-4927-a1ba-838a7f2d35a5', {});
      expect(extra).toBe(2);
    });
  });

  describe('Subscription Plan-Change Safeguards', () => {
    it('1. previewSubscriptionPlanChange returns a verified $0.00 scheduled preview for downgrades', async () => {
      const preview = await service.previewSubscriptionPlanChange({
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_456',
        currentPriceId: 'price_basic',
        currentPlanName: 'Basic Plan',
        currentPlanAmount: 4900,
        currentPlanCurrency: 'usd',
        currentPlanInterval: 'month',
        newPriceId: 'price_starter',
        newPlanName: 'Starter Plan',
        newPlanAmount: 2900,
        newPlanCurrency: 'usd',
        newPlanInterval: 'month',
        isUpgrade: false,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
      });

      expect(preview.verified).toBe(true);
      expect(preview.verificationStatus).toBe('verified');
      expect(preview.isUpgrade).toBe(false);
      expect(preview.timing).toBe('scheduled');
      expect(preview.effectiveDate).toBe(1702500000);
      expect(preview.amountDueToday).toBe(0);
      expect(preview.renewalAmount).toBe(2900);
    });

    it('2. previewSubscriptionPlanChange returns unverified amountDueToday=null for upgrades when no preview flow is configured, never inventing a dollar amount', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost');
      const preview = await service.previewSubscriptionPlanChange({
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_456',
        currentPriceId: 'price_basic',
        currentPlanName: 'Basic Plan',
        currentPlanAmount: 4900,
        currentPlanCurrency: 'usd',
        currentPlanInterval: 'month',
        newPriceId: 'price_advanced',
        newPlanName: 'Advanced Plan',
        newPlanAmount: 8900,
        newPlanCurrency: 'usd',
        newPlanInterval: 'month',
        isUpgrade: true,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
      });

      expect(flowSpy).not.toHaveBeenCalled();
      expect(preview.verified).toBe(false);
      expect(preview.verificationStatus).toBe('unavailable');
      expect(preview.isUpgrade).toBe(true);
      expect(preview.timing).toBe('immediate');
      expect(preview.amountDueToday).toBeNull();
      expect(preview.errorCode).toBe('UPGRADE_PRORATION_PREVIEW_UNAVAILABLE');
    });

    it('3. previewSubscriptionPlanChange rejects promotion codes when plan-change promo is not supported', async () => {
      const preview = await service.previewSubscriptionPlanChange({
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_456',
        currentPriceId: 'price_basic',
        currentPlanName: 'Basic Plan',
        currentPlanAmount: 4900,
        currentPlanCurrency: 'usd',
        currentPlanInterval: 'month',
        newPriceId: 'price_advanced',
        newPlanName: 'Advanced Plan',
        newPlanAmount: 8900,
        newPlanCurrency: 'usd',
        newPlanInterval: 'month',
        isUpgrade: true,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        promotionCode: 'SAVE50',
      });

      expect(preview.verified).toBe(false);
      expect(preview.couponState).toBe('invalid_or_ineligible');
      expect(preview.errorCode).toBe('PLAN_CHANGE_PROMO_UNSUPPORTED');
    });

    it('4. loadSavedPaymentMethods enforces subscription > customer default precedence and does not mark unverified cards as default', async () => {
      // Case A: standard Directus response with paymentMethods array only -> defaultVerified: false
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        paymentMethods: [
          { id: 'pm_saved_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2029 },
        ],
      });
      const unverifiedRes = await service.loadSavedPaymentMethods();
      expect(unverifiedRes.defaultVerified).toBe(false);
      expect(unverifiedRes.defaultPaymentMethodId).toBeNull();
      expect(unverifiedRes.paymentMethods[0].isRenewalCard).not.toBe(true);

      // Case B: subscription default takes precedence over customer default
      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        paymentMethods: [
          { id: 'pm_cust', brand: 'visa', last4: '1111', expMonth: 12, expYear: 2029 },
          { id: 'pm_sub', brand: 'mastercard', last4: '2222', expMonth: 12, expYear: 2029 },
        ],
        customerDefaultPaymentMethodId: 'pm_cust',
        subscriptionDefaultPaymentMethodId: 'pm_sub',
      });
      const verifiedRes = await service.loadSavedPaymentMethods();
      expect(verifiedRes.defaultVerified).toBe(true);
      expect(verifiedRes.defaultPaymentMethodId).toBe('pm_sub');
      expect(verifiedRes.defaultPaymentMethodSource).toBe('subscription');
      expect(verifiedRes.paymentMethods.find((m) => m.id === 'pm_sub')?.isRenewalCard).toBe(true);
      expect(verifiedRes.paymentMethods.find((m) => m.id === 'pm_cust')?.isRenewalCard).toBe(false);
    });

    it('5. changeSubscriptionPlan preserves exact 8-field STRIPE_UPDATE_SUBSCRIPTION_FLOW payload and blocks invoice amount mismatch', async () => {
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        status: 'active',
        priceId: 'price_advanced',
        invoiceAmountDue: 8900,
        invoiceCurrency: 'usd',
      });

      const res = await service.changeSubscriptionPlan(
        'sub_123',
        'si_456',
        'price_advanced',
        true,
        'Advanced Plan',
        1700000000,
        1702500000,
        'price_basic',
        {
          approvedAmountDue: 4000,
          approvedCurrency: 'usd',
        },
      );

      expect(flowSpy).toHaveBeenCalledWith('2b1a4494-8999-4c27-b70e-ddcc47bb16f3', {
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_456',
        newPriceId: 'price_advanced',
        isUpgrade: true,
        newPlanName: 'Advanced Plan',
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        currentPriceId: 'price_basic',
      });
      expect(res.status).toBe('failed');
      expect(res.errorCode).toBe('AMOUNT_MISMATCH_BLOCKED');
    });

    it('6. changeSubscriptionPlan reconciles against getSubscription after a network timeout before retrying', async () => {
      const flowSpy = vi
        .spyOn(service, 'flowPost')
        .mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        service.changeSubscriptionPlan(
          'sub_123',
          'si_456',
          'price_advanced',
          true,
          'Advanced Plan',
          1700000000,
          1702500000,
          'price_basic',
          { customerEmail: 'sofia@restaurant.com' },
        ),
      ).rejects.toThrow('Network timeout');
      expect(flowSpy).toHaveBeenCalledTimes(1);

      // On retry, getSubscription shows the upgrade already took effect on the server
      vi.spyOn(service, 'getSubscription').mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        subscriptionItemId: 'si_456',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702500000,
        plan: {
          priceId: 'price_advanced',
          productName: 'Advanced Plan',
          amount: 8900,
          currency: 'usd',
          interval: 'month',
        },
      });

      const retryRes = await service.changeSubscriptionPlan(
        'sub_123',
        'si_456',
        'price_advanced',
        true,
        'Advanced Plan',
        1700000000,
        1702500000,
        'price_basic',
        { customerEmail: 'sofia@restaurant.com' },
      );

      // Should not call the update flow a second time when reconciled
      expect(flowSpy).toHaveBeenCalledTimes(1);
      expect(retryRes.status).toBe('confirmed');
      expect(retryRes.priceId).toBe('price_advanced');
    });
  });

  describe('Payment Element Lifecycle & SetupIntent Subscription Extraction', () => {
    it('extracts setup_result_existing and setup_result_new from STRIPE_CREATE_SUBSCRIPTION_FLOW for $0 promotional SetupIntent checkouts', async () => {
      runtimeConfig.updateConfig({ stripeCreateSubscriptionFlow: 'flow-create-sub' });
      const flowSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        setup_result_existing: {
          clientSecret: 'seti_123_secret_abc',
          setupIntentId: 'seti_123',
          subscriptionId: null,
          requiresSetup: true,
        },
      });

      const res = await service.createSubscription(
        'sofia@restaurant.com',
        'Sofia',
        'price_basic_live',
        'promo_free100',
      );

      expect(flowSpy).toHaveBeenCalledWith('flow-create-sub', {
        email: 'sofia@restaurant.com',
        name: 'Sofia',
        priceId: 'price_basic_live',
        promotionCode: 'promo_free100',
      });
      expect(res.requiresSetup).toBe(true);
      expect(res.setupIntentId).toBe('seti_123');
      expect(res.clientSecret).toBe('seti_123_secret_abc');
    });

    it('cleans up prior Payment Element, clears container DOM, and forwards loaderror events in mountPaymentElement', async () => {
      const container = document.createElement('div');
      container.id = 'portal-addon-payment-element';
      container.innerHTML = '<span>stale content</span>';
      document.body.appendChild(container);

      const listeners: Record<string, (ev: any) => void> = {};
      const firstElement = {
        mount: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn((event: string, cb: (ev: any) => void) => {
          listeners[event] = cb;
        }),
      };
      const secondElement = {
        mount: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn((event: string, cb: (ev: any) => void) => {
          listeners[event] = cb;
        }),
      };

      let callCount = 0;
      const mockStripe: any = {
        elements: vi.fn(() => ({
          create: vi.fn(() => {
            callCount++;
            return callCount === 1 ? firstElement : secondElement;
          }),
        })),
      };
      vi.spyOn(service, 'getStripe').mockResolvedValue(mockStripe);

      try {
        await service.mountPaymentElement('pi_1_secret_a', 'portal-addon-payment-element');
        expect(container.innerHTML).toBe('');
        expect(firstElement.mount).toHaveBeenCalledWith(container);

        const onLoadError = vi.fn();
        await service.mountPaymentElement('pi_2_secret_b', 'portal-addon-payment-element', {
          onLoadError,
        });
        // Prior element must be destroyed before mounting the new one
        expect(firstElement.destroy).toHaveBeenCalledTimes(1);
        expect(secondElement.mount).toHaveBeenCalledWith(container);

        // Trigger async Stripe loaderror
        listeners['loaderror']?.({ error: { code: 'invalid_client_secret', message: 'Invalid secret' } });
        expect(onLoadError).toHaveBeenCalledWith({
          code: 'invalid_client_secret',
          message: 'Invalid secret',
        });
      } finally {
        container.remove();
      }
    });
  });
});


