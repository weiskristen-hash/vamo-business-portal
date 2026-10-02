import { TestBed } from '@angular/core/testing';
import { StripeService, StripePlan } from './stripe.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('StripeService', () => {
  let service: StripeService;
  let authServiceSpy: any;

  beforeEach(() => {
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
    it('should return default canonical plans with verified features when flow is unconfigured', async () => {
      const originalFlow = environment.STRIPE_GET_PRICES_FLOW;
      (environment as any).STRIPE_GET_PRICES_FLOW = '';

      const plans = await service.getPlans();
      expect(plans.length).toBe(3);
      expect(plans[0].tier).toBe('starter');
      expect(plans[0].maxPosts).toBe(1);
      expect(plans[0].features.length).toBeGreaterThan(0);

      expect(plans[1].tier).toBe('basic');
      expect(plans[1].maxPosts).toBe(4);

      expect(plans[2].tier).toBe('advanced');
      expect(plans[2].maxPosts).toBe(8);

      (environment as any).STRIPE_GET_PRICES_FLOW = originalFlow;
    });

    it('should map flow prices into StripePlan objects with entitlements when flow is configured', async () => {
      const originalFlow = environment.STRIPE_GET_PRICES_FLOW;
      (environment as any).STRIPE_GET_PRICES_FLOW = 'flow-prices';

      vi.spyOn(service, 'flowPost').mockResolvedValueOnce({
        data: [
          {
            id: 'price-1',
            active: true,
            unit_amount: 2900,
            currency: 'usd',
            recurring: { interval: 'month' },
            product: { name: 'Starter Plan', description: 'Desc 1' },
          },
        ],
      });

      const plans = await service.getPlans();
      expect(plans.length).toBe(1);
      expect(plans[0].id).toBe('price-1');
      expect(plans[0].tier).toBe('starter');
      expect(plans[0].amount).toBe(2900);
      expect(plans[0].maxPosts).toBe(1);

      (environment as any).STRIPE_GET_PRICES_FLOW = originalFlow;
    });
  });

  describe('validatePromoCode', () => {
    it('should send code to STRIPE_VALIDATE_PROMO_FLOW and return promo result', async () => {
      const originalFlow = environment.STRIPE_VALIDATE_PROMO_FLOW;
      (environment as any).STRIPE_VALIDATE_PROMO_FLOW = 'flow-promo';

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

      (environment as any).STRIPE_VALIDATE_PROMO_FLOW = originalFlow;
    });
  });

  describe('createSubscription', () => {
    it('should call STRIPE_CREATE_SUBSCRIPTION_FLOW and return clientSecret and subscriptionId', async () => {
      const originalFlow = environment.STRIPE_CREATE_SUBSCRIPTION_FLOW;
      (environment as any).STRIPE_CREATE_SUBSCRIPTION_FLOW = 'flow-create-sub';

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
        'price_basic'
      );
      expect(res.clientSecret).toBe('pi_test_secret');
      expect(res.subscriptionId).toBe('sub_test_123');
      expect(res.requiresSetup).toBe(false);

      (environment as any).STRIPE_CREATE_SUBSCRIPTION_FLOW = originalFlow;
    });
  });

  describe('cancelSubscription and changeSubscriptionPlan', () => {
    it('should call cancel flow with subscriptionId and cancelAtPeriodEnd flag', async () => {
      const originalFlow = environment.STRIPE_CANCEL_SUBSCRIPTION_FLOW;
      (environment as any).STRIPE_CANCEL_SUBSCRIPTION_FLOW = 'flow-cancel';

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      await service.cancelSubscription('sub_999', true);

      expect(postSpy).toHaveBeenCalledWith('flow-cancel', {
        subscriptionId: 'sub_999',
        cancelAtPeriodEnd: true,
      });

      (environment as any).STRIPE_CANCEL_SUBSCRIPTION_FLOW = originalFlow;
    });

    it('should call change plan flow with proration metadata', async () => {
      const originalFlow = environment.STRIPE_CHANGE_SUBSCRIPTION_FLOW;
      (environment as any).STRIPE_CHANGE_SUBSCRIPTION_FLOW = 'flow-change';

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

      (environment as any).STRIPE_CHANGE_SUBSCRIPTION_FLOW = originalFlow;
    });
  });

  describe('setProviderTier', () => {
    it('should call SET_PROVIDER_TIER_FLOW with new tier', async () => {
      const originalFlow = environment.SET_PROVIDER_TIER_FLOW;
      (environment as any).SET_PROVIDER_TIER_FLOW = 'flow-set-tier';

      const postSpy = vi.spyOn(service, 'flowPost').mockResolvedValueOnce({});
      await service.setProviderTier('basic');

      expect(postSpy).toHaveBeenCalledWith('flow-set-tier', { tier: 'basic' });

      (environment as any).SET_PROVIDER_TIER_FLOW = originalFlow;
    });
  });
});
