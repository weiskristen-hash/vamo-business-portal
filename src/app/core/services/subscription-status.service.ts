import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { StripeService, StripeSubscription } from './stripe.service';
import { I18nService } from '../i18n/i18n.service';

export type SubscriptionState = 'loading' | 'active' | 'trialing' | 'inactive' | 'error';

export interface SubscriptionViewModel {
  state: SubscriptionState;
  subscription: StripeSubscription | null;
  tier: 'starter' | 'basic' | 'advanced' | null;
  tierName: string;
  cardTierDisplay: string;
  cardStatusDisplay: string;
  topbarStatusDisplay: string;
  statusClass: string;
  cardBadgeClass: string;
}

export function resolveTierFromProductName(productName: string | null | undefined): 'starter' | 'basic' | 'advanced' | null {
  const n = (productName ?? '').toLowerCase();
  if (n.includes('advanced')) return 'advanced';
  if (n.includes('basic')) return 'basic';
  if (n.includes('starter')) return 'starter';
  return null;
}

export function cleanTierName(productName: string): string {
  const tier = resolveTierFromProductName(productName);
  if (tier === 'starter') return 'Starter';
  if (tier === 'basic') return 'Basic';
  if (tier === 'advanced') return 'Advanced';
  return productName.trim();
}

export function evaluateSubscriptionAccess(
  sub: StripeSubscription | null,
  nowSec: number = Math.floor(Date.now() / 1000)
): { state: 'active' | 'trialing' | 'inactive'; tier: 'starter' | 'basic' | 'advanced' | null; tierName: string } {
  if (!sub) {
    return { state: 'inactive', tier: null, tierName: '' };
  }

  // Access policy: only 'active' and 'trialing' grant current entitlement
  if (sub.status === 'trialing') {
    const planName = (sub.plan as any)?.productName || (sub.plan as any)?.name;
    const tier = resolveTierFromProductName(planName);
    const tierName = tier ? (tier.charAt(0).toUpperCase() + tier.slice(1)) : (planName ? cleanTierName(planName) : 'Trial');
    return {
      state: 'trialing',
      tier,
      tierName,
    };
  }

  if (sub.status === 'active') {
    // If canceled at period end, keep current plan until currentPeriodEnd expires
    if (sub.cancelAtPeriodEnd && typeof sub.currentPeriodEnd === 'number' && sub.currentPeriodEnd > 0) {
      if (sub.currentPeriodEnd <= nowSec) {
        return { state: 'inactive', tier: null, tierName: '' };
      }
    }
    const planName = (sub.plan as any)?.productName || (sub.plan as any)?.name;
    const tier = resolveTierFromProductName(planName);
    const tierName = tier ? (tier.charAt(0).toUpperCase() + tier.slice(1)) : (planName ? cleanTierName(planName) : 'Starter');
    return { state: 'active', tier, tierName };
  }

  // Non-access statuses: past_due, unpaid, paused, canceled, incomplete, incomplete_expired
  return { state: 'inactive', tier: null, tierName: '' };
}

export function buildSubscriptionViewModel(
  raw: { state: SubscriptionState; sub: StripeSubscription | null },
  lang: string,
  t: (key: string, params?: Record<string, any>) => string,
  nowSec: number = Math.floor(Date.now() / 1000)
): SubscriptionViewModel {
  const { state: rawState, sub } = raw;

  if (rawState === 'loading') {
    return {
      state: 'loading',
      subscription: sub,
      tier: null,
      tierName: '',
      cardTierDisplay: t('PORTAL.OVERVIEW.TIER_LOADING') || '···',
      cardStatusDisplay: t('PORTAL.OVERVIEW.SUB_LOADING') || (lang === 'es' ? 'Cargando suscripción…' : 'Loading subscription…'),
      topbarStatusDisplay: t('PORTAL.SHELL.STATUS_LOADING') || '···',
      statusClass: 'is-loading',
      cardBadgeClass: 'badge-loading',
    };
  }

  if (rawState === 'error') {
    return {
      state: 'error',
      subscription: sub,
      tier: null,
      tierName: '',
      cardTierDisplay: t('PORTAL.OVERVIEW.TIER_UNAVAILABLE') || (lang === 'es' ? 'NO DISPONIBLE' : 'UNAVAILABLE'),
      cardStatusDisplay: t('PORTAL.OVERVIEW.SUB_UNAVAILABLE') || (lang === 'es' ? 'Suscripción no disponible' : 'Subscription unavailable'),
      topbarStatusDisplay: t('PORTAL.SHELL.STATUS_UNAVAILABLE') || (lang === 'es' ? 'No disponible' : 'Unavailable'),
      statusClass: 'is-error',
      cardBadgeClass: 'badge-archived',
    };
  }

  const evaluation = evaluateSubscriptionAccess(sub, nowSec);

  if (evaluation.state === 'inactive') {
    return {
      state: 'inactive',
      subscription: sub,
      tier: null,
      tierName: '',
      cardTierDisplay: t('PORTAL.OVERVIEW.TIER_INACTIVE') || (lang === 'es' ? 'INACTIVA' : 'INACTIVE'),
      cardStatusDisplay: t('PORTAL.OVERVIEW.SUB_INACTIVE') || (lang === 'es' ? 'Sin suscripción activa' : 'No active subscription'),
      topbarStatusDisplay: t('PORTAL.SHELL.STATUS_INACTIVE') || (lang === 'es' ? 'Inactiva' : 'Inactive'),
      statusClass: 'is-inactive',
      cardBadgeClass: 'badge-draft',
    };
  }

  if (evaluation.state === 'trialing') {
    const trialWord = t('PORTAL.SHELL.STATUS_TRIAL') || (lang === 'es' ? 'Prueba' : 'Trial');
    return {
      state: 'trialing',
      subscription: sub,
      tier: evaluation.tier,
      tierName: evaluation.tierName,
      cardTierDisplay: evaluation.tierName ? evaluation.tierName.toUpperCase() : trialWord.toUpperCase(),
      cardStatusDisplay: t('PORTAL.OVERVIEW.SUB_TRIAL') || (lang === 'es' ? 'Suscripción de prueba' : 'Trial subscription'),
      topbarStatusDisplay: evaluation.tierName ? `${evaluation.tierName} · ${trialWord}` : trialWord,
      statusClass: 'is-trialing',
      cardBadgeClass: 'badge-published',
    };
  }

  // Active state
  const activeWord = t('PORTAL.SHELL.STATUS_ACTIVE') || (lang === 'es' ? 'Activa' : 'Active');
  return {
    state: 'active',
    subscription: sub,
    tier: evaluation.tier,
    tierName: evaluation.tierName,
    cardTierDisplay: evaluation.tierName.toUpperCase(),
    cardStatusDisplay: t('PORTAL.OVERVIEW.SUB_ACTIVE') || (lang === 'es' ? 'Suscripción activa' : 'Active subscription'),
    topbarStatusDisplay: `${evaluation.tierName} · ${activeWord}`,
    statusClass: 'is-active',
    cardBadgeClass: 'badge-published',
  };
}

@Injectable({ providedIn: 'root' })
export class SubscriptionStatusService {
  private authService = inject(AuthService);
  private stripeService = inject(StripeService);
  private i18n = inject(I18nService);

  private currentProviderId: string | null = null;
  private currentEmail: string | null = null;
  private loadNonce = 0;

  private rawState = signal<{ state: SubscriptionState; sub: StripeSubscription | null }>({
    state: 'loading',
    sub: null,
  });

  readonly status = computed<SubscriptionViewModel>(() => {
    // Read reactive lang signal so language switches update display strings immediately
    const lang = this.i18n.lang();
    return buildSubscriptionViewModel(
      this.rawState(),
      lang,
      (k, p) => this.i18n.t(k, p)
    );
  });

  constructor() {
    if (this.authService?.user$) {
      this.authService.user$.subscribe((user) => {
        this.handleUserChange(user);
      });
    } else if (this.authService?.currentUser) {
      this.handleUserChange(this.authService.currentUser);
    }
  }

  private handleUserChange(user: any): void {
    const providerId = user?.provider_link?.id ?? null;
    const email = user?.email ?? null;

    if (!user || !providerId || !email) {
      this.currentProviderId = null;
      this.currentEmail = null;
      this.loadNonce++;
      this.rawState.set({ state: 'inactive', sub: null });
      return;
    }

    if (providerId !== this.currentProviderId || email !== this.currentEmail) {
      this.currentProviderId = providerId;
      this.currentEmail = email;
      void this.loadSubscriptionFor(email);
    }
  }

  async refresh(): Promise<SubscriptionViewModel> {
    const email = this.currentEmail || this.authService.currentUser?.email;
    if (!email || !this.currentProviderId) {
      this.rawState.set({ state: 'inactive', sub: null });
      return this.status();
    }
    await this.loadSubscriptionFor(email);
    return this.status();
  }

  private async loadSubscriptionFor(email: string): Promise<void> {
    const nonce = ++this.loadNonce;
    this.rawState.set({ state: 'loading', sub: this.rawState().sub });

    try {
      const sub = await this.stripeService.getSubscription(email);
      if (nonce !== this.loadNonce) return;
      this.rawState.set({ state: sub ? 'active' : 'inactive', sub });
    } catch {
      if (nonce !== this.loadNonce) return;
      this.rawState.set({ state: 'error', sub: null });
    }
  }
}
