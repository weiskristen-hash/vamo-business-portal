import { TestBed } from '@angular/core/testing';
import { PublishingAccessService } from './publishing-access.service';
import { StripeService } from './stripe.service';
import { BusinessService } from './business.service';

describe('PublishingAccessService', () => {
  let service: PublishingAccessService;
  let stripe: any;
  let business: any;
  beforeEach(() => {
    stripe = {
      getSubscription: vi.fn().mockResolvedValue({ status: 'active', currentPeriodEnd: 1793404800, plan: { productName: 'Basic Plan' } }),
      getPlanLimits: vi.fn().mockResolvedValue([{ productName: 'Basic', max_posts: 4 }]),
      getExtraPosts: vi.fn().mockResolvedValue(0),
    };
    business = { getPublishedPostCount: vi.fn().mockResolvedValue(0) };
    TestBed.configureTestingModule({ providers: [
      PublishingAccessService,
      { provide: StripeService, useValue: stripe },
      { provide: BusinessService, useValue: business },
    ] });
    service = TestBed.inject(PublishingAccessService);
  });

  it('requires subscription for a newly created business without Stripe subscription', async () => {
    stripe.getSubscription.mockResolvedValue(null);
    expect(await service.check('new@example.com', 'p-new')).toEqual({ allowed: false, reason: 'subscription' });
    expect(business.getPublishedPostCount).not.toHaveBeenCalled();
  });

  it.each(['incomplete', 'canceled', 'past_due', 'unpaid'])('does not publish with %s status', async (status) => {
    stripe.getSubscription.mockResolvedValue({ status });
    expect(await service.check('host@example.com', 'p-1')).toEqual({ allowed: false, reason: 'subscription' });
  });

  it('permits publishing with remaining quota and queries canonical billing window', async () => {
    expect(await service.check('host@example.com', 'p-1')).toEqual({ allowed: true, usesAddonSlot: false });
    expect(business.getPublishedPostCount).toHaveBeenCalledWith('p-1', new Date((1793404800 - 32 * 86400) * 1000).toISOString());
  });

  it('blocks an exhausted quota', async () => {
    business.getPublishedPostCount.mockResolvedValue(4);
    expect(await service.check('host@example.com', 'p-1')).toEqual({ allowed: false, reason: 'quota' });
  });

  it('uses an additional-post credit beyond included quota', async () => {
    stripe.getExtraPosts.mockResolvedValue(1);
    business.getPublishedPostCount.mockResolvedValue(4);
    expect(await service.check('host@example.com', 'p-1')).toEqual({ allowed: true, usesAddonSlot: true });
  });

  it('does not mistake a subscription lookup outage for no subscription', async () => {
    stripe.getSubscription.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(service.check('host@example.com', 'p-1')).rejects.toThrow('Failed to fetch');
  });

  it('fails closed if the current plan cannot be matched to server limits', async () => {
    stripe.getPlanLimits.mockResolvedValue([]);
    await expect(service.check('host@example.com', 'p-1')).rejects.toThrow('quota could not be verified');
    expect(business.getPublishedPostCount).not.toHaveBeenCalled();
  });
});
