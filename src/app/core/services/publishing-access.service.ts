import { Injectable, inject } from '@angular/core';
import { StripeService } from './stripe.service';
import { BusinessService } from './business.service';

export type PublishingAccess =
  | { allowed: false; reason: 'subscription' | 'quota' }
  | { allowed: true; usesAddonSlot: boolean };

@Injectable({ providedIn: 'root' })
export class PublishingAccessService {
  private stripe = inject(StripeService);
  private business = inject(BusinessService);

  async check(email: string, providerId: string): Promise<PublishingAccess> {
    if (!email || !providerId) throw new Error('Publishing account information is missing.');
    const sub = await this.stripe.getSubscription(email);
    if (!sub || !['active', 'trialing'].includes(sub.status)) {
      return { allowed: false, reason: 'subscription' };
    }

    const limits = await this.stripe.getPlanLimits();
    const name = (sub.plan.productName ?? '').toLowerCase();
    const limit = limits.find(p => p.productName && name.includes(p.productName.toLowerCase()))?.max_posts;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 ||
        !Number.isFinite(sub.currentPeriodEnd) || sub.currentPeriodEnd <= 0) {
      throw new Error('Publishing quota could not be verified.');
    }
    // Match the existing VAMO create-event billing window and add-on rule.
    const since = new Date((sub.currentPeriodEnd - 32 * 24 * 3600) * 1000).toISOString();
    const [extra, used] = await Promise.all([
      this.stripe.getExtraPosts(),
      this.business.getPublishedPostCount(providerId, since),
    ]);
    if (!Number.isInteger(extra) || extra < 0) throw new Error('Additional post quota could not be verified.');
    if (used >= limit + extra) return { allowed: false, reason: 'quota' };
    return { allowed: true, usesAddonSlot: used >= limit };
  }
}
