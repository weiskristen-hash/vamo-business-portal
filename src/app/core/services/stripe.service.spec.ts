import { TestBed } from '@angular/core/testing';
import { StripeService, StripePlan } from './stripe.service';
import { AuthService } from './auth.service';
import { runtimeConfig } from '../config/runtime-config';

describe('StripeService', () => {
  let service: StripeService;
  let authServiceSpy: any;

  beforeEach(() => {
    runtimeConfig.reset();

    authServiceSpy = {
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

  describe('formatPrice', () => {
    it('should format cents into localized currency string', () => {
      const formatted = service.formatPrice(2900, 'usd');
      expect(formatted).toContain('29');
      expect(formatted).toContain('$');
    });
  });

  describe('flowPost execution', () => {
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

    it('should call change plan flow with proration metadata', async () => {
      runtimeConfig.updateConfig({ stripeChangeSubscriptionFlow: 'flow-change' });

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      await service.changeSubscriptionPlan(
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
});
