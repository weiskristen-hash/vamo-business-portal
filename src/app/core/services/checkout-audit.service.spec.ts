import { TestBed } from '@angular/core/testing';
import { CheckoutAuditService, sanitizeAuditString } from './checkout-audit.service';

describe('CheckoutAuditService & Privacy Redaction', () => {
  let service: CheckoutAuditService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CheckoutAuditService],
    });
    service = TestBed.inject(CheckoutAuditService);
    service.clear();
  });

  it('redacts Stripe client secrets, secret keys, Bearer tokens, and card numbers from audit strings', () => {
    const raw =
      'Failed pi_3Oct19_secret_SuperSecret999 and seti_1Abc_secret_Hidden888 with sk_live_987654321 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def on card 4242 4242 4242 4242';
    const sanitized = sanitizeAuditString(raw);

    expect(sanitized).toContain('pi_3Oct19_[REDACTED_SECRET]');
    expect(sanitized).toContain('seti_1Abc_[REDACTED_SECRET]');
    expect(sanitized).toContain('[REDACTED_STRIPE_KEY]');
    expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    expect(sanitized).toContain('[REDACTED_CARD]');
    expect(sanitized).not.toContain('SuperSecret999');
    expect(sanitized).not.toContain('Hidden888');
    expect(sanitized).not.toContain('sk_live_987654321');
    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sanitized).not.toContain('4242 4242 4242 4242');
  });

  it('records all checkout lifecycle audit events with correlationId and sanitizes any sensitive reason strings', () => {
    const corrId = service.startNewCorrelation();
    expect(corrId.startsWith('chk_')).toBe(true);

    const evt = service.record('amount_mismatch_blocked', {
      priceId: 'price_basic_5900',
      promotionCode: 'FOUNDERS90',
      promotionCodeId: 'promo_123',
      verificationReference: 'vref_1_xyz',
      approvedAmount: 0,
      actualAmount: 5900,
      currency: 'usd',
      reason: 'Blocked pi_3Oct19_secret_LeakAttempt123 from being confirmed',
    });

    expect(evt.correlationId).toBe(corrId);
    expect(evt.event).toBe('amount_mismatch_blocked');
    expect(evt.approvedAmount).toBe(0);
    expect(evt.actualAmount).toBe(5900);
    expect(evt.reason).toContain('pi_3Oct19_[REDACTED_SECRET]');
    expect(evt.reason).not.toContain('LeakAttempt123');
    expect(service.getEntries().length).toBe(1);
  });
});
