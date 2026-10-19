# Verified Stripe Checkout & Charge Protection — Directus Flow Rollout Report

**Status:** Isolated / Ready for Approved Production Rollout  
**Production Mutations Performed:** **NONE** (Strictly read-only inspection per authorization policy)  
**Target Directus Instance:** `https://api.vamo-app.com`  
**Isolated Flow Definitions:** [`docs/directus-flows/verified-stripe-checkout-flows.json`](./verified-stripe-checkout-flows.json)

---

## 1. Root Cause Analysis of the October 19 Incident (`adminapple@admin.com` $59 Charge)

Read-only inspection of the live Directus Flow endpoints and the existing portal checkout flow identified three interacting vulnerabilities that allowed a subscription to be charged **$59.00** despite an intended 100% promotion code:

1. **Non-Authoritative Promotion Validation (`3b580ce9-5023-446f-ad4c-55c8ee5db4fd`)**
   - Calling `POST https://api.vamo-app.com/flows/trigger/3b580ce9-5023-446f-ad4c-55c8ee5db4fd` with `{"code": "FOUNDERS90"}` returns only bare coupon metadata:
     ```json
     {
       "valid": true,
       "promoCodeId": "promo_1UKiYz2aqrJCvAj3rpoKa3Kf",
       "name": "LT Founders club",
       "percentOff": 100,
       "amountOff": null,
       "duration": "repeating",
       "durationInMonths": 3
     }
     ```
   - The flow does **not** accept `priceId` or `email`, does **not** verify product/customer restrictions (`applies_to.products`, `first_time_transaction`, `minimum_amount`), does **not** create an authoritative Stripe Invoice Preview (`POST /v1/invoices/create_preview`), and does **not** issue a signed `verificationReference`.

2. **Prefilled or Unverified Coupon State & Missing Order Summary**
   - Previously, the checkout panel did not display an authoritative Order Summary (`Original price`, `Verified discount`, `Amount due today`, `Renewal disclosure`, `Stripe verification status`).
   - If a customer had a prefilled or typed coupon code without completed server verification—or changed plans after applying a coupon—there was no checkout-preview lock tying the displayed price to the selected `priceId` and `promotionCodeId`.

3. **No Pre-Charge Invoice Verification in Subscription Creation (`0a31e459-0909-41b0-8286-2aecc763fe29`)**
   - `0a31e459-0909-41b0-8286-2aecc763fe29` (`CREATE_SUBSCRIPTION_FLOW`) only returned `{ clientSecret, subscriptionId, requiresSetup }` without accepting `approvedAmountDue`, `approvedCurrency`, or `verificationReference`, and without returning `invoiceAmountDue`, `invoiceCurrency`, `appliedPromotionCodeId`, or `discountApplied`.
   - When `createSubscription` returned a `pi_...` PaymentIntent for `$59.00` instead of a `$0.00` invoice/SetupIntent, `BillingComponent.proceedToPayment()` immediately confirmed payment with the saved card or mounted the Payment Element without checking whether the invoice amount matched the customer-approved amount.

---

## 2. Defense-in-Depth Architecture Implemented

### A. Portal Frontend (`src/app/core/services/stripe.service.ts` & `src/app/pages/billing/billing.component.ts`)
1. **Verified Order Summary & Coupon State Machine:**
   - Displays selected plan & interval, original price, applied promotion code, verified discount amount, **Amount due today**, renewal terms (`once`, `repeating` for $N$ months, `forever`), and Stripe verification badge.
   - Enforces explicit coupon states: `not_applied`, `validating`, `verified_applied`, `invalid_or_ineligible`, `expired_or_changed`, `verification_unavailable`.
   - Prefilled codes (`?promo=FOUNDERS90`) always start in `not_applied` state with an explicit prompt to click **Apply** and never reduce the displayed `Amount due today` until server verification succeeds.
   - Editing the coupon or switching plans immediately invalidates any prior verified preview and recalculates.
   - Checkout buttons display the exact verified amount in English and Spanish:
     - `$0.00`: `Activate subscription — $0.00` / `Activar suscripción — $0.00`
     - `> $0.00`: `Pay $59.00 and subscribe` / `Pagar $59.00 y suscribirse`
     - Loading: `Verifying price…` / `Verificando precio…`

2. **Authoritative Preview Requirement (`previewSubscriptionCheckout`):**
   - Calls `stripePreviewCheckoutFlow` (`e8f9a1b2-3c4d-4e5f-8a6b-7c8d9e0f1a2b`) and requires authoritative numeric fields (`subtotal`, `discountAmount`, `amountDueToday`, `currency`, `priceId`, and `verificationReference`).
   - Rejects bare coupon metadata that lacks an invoice preview total—never computing discounts client-side.

3. **Hard Stop Before Collecting Payment (`createVerifiedSubscription`):**
   - Sends `email`, `name`, `priceId`, `promotionCodeId`, `approvedAmountDue`, `approvedCurrency`, `verificationReference`, and `idempotencyKey`.
   - Inspects the returned first-invoice verification fields **before** `confirmWithSavedMethod`, `confirmSetupWithSavedMethod`, or `mountPaymentElement`:
     - **Rule 1 (`ZERO_AMOUNT_PAYMENT_INTENT_BLOCKED`):** If `approvedAmountDue === 0` and the backend returns a `pi_...` PaymentIntent (`!requiresSetup`) or `invoiceAmountDue > 0`, checkout halts immediately, cancels any incomplete subscription best-effort, and displays a clear error without charging the customer.
     - **Rule 2 (`AMOUNT_EXCEEDS_APPROVED` / `UNVERIFIED_FIRST_INVOICE_AMOUNT`):** If `invoiceAmountDue` is missing or `invoiceAmountDue > approvedAmountDue`, checkout halts immediately.
     - **Rule 3 (`PROMOTION_NOT_APPLIED_ON_INVOICE`):** If `promotionCodeId` was approved (`approvedAmountDue < plan.amount`) but `discountApplied === false` or `appliedPromotionCodeId !== promotionCodeId`, checkout halts immediately.
     - **Rule 4 (`CURRENCY_MISMATCH`):** If `invoiceCurrency !== approvedCurrency`, checkout halts immediately.

4. **Privacy-Safe Audit Logging (`CheckoutAuditService`):**
   - Records structured events (`promotion_submitted`, `promotion_validation_succeeded`, `promotion_validation_failed`, `invoice_preview_created`, `amount_displayed_for_approval`, `subscription_creation_attempted`, `first_invoice_verified`, `amount_mismatch_blocked`, `payment_succeeded`, `payment_failed`) with a per-checkout `correlationId` while redacting `pi_..._secret_...`, `seti_..._secret_...`, Bearer tokens, API keys, and card numbers.

---

## 3. Isolated Directus Flow Rollout Instructions (Requires Explicit Approval)

All Directus Flow definitions are packaged in [`docs/directus-flows/verified-stripe-checkout-flows.json`](./verified-stripe-checkout-flows.json).

### Flow 1: `Stripe: Preview Subscription Checkout` (`e8f9a1b2-3c4d-4e5f-8a6b-7c8d9e0f1a2b`)
- **Trigger:** Webhook `POST /flows/trigger/e8f9a1b2-3c4d-4e5f-8a6b-7c8d9e0f1a2b`
- **Request Payload:**
  ```json
  {
    "email": "customer@example.com",
    "priceId": "price_1TcqK3GWvZAV5mbnBLpijcYO",
    "promotionCode": "FOUNDERS90"
  }
  ```
- **Behavior:**
  1. Retrieves the authoritative Stripe `Price` and expanded `Product` (`GET /v1/prices/:id?expand[]=product`).
  2. Looks up the existing Stripe `Customer` by email (`GET /v1/customers?email=...`).
  3. If `promotionCode` is provided, looks up active `promotion_codes` and validates `active`, `coupon.valid`, `expires_at`, `max_redemptions`, `applies_to.products`, `restrictions.minimum_amount`, and `restrictions.first_time_transaction`.
  4. Calls `POST /v1/invoices/create_preview` with `subscription_details[items][0][price]=<priceId>` and `discounts[0][promotion_code]=<promoObj.id>`.
  5. Returns `subtotal`, `discountAmount`, `tax`, `amountDueToday`, `renewalAmount`, `duration`, `durationInMonths`, and an HMAC-signed `verificationReference`.

### Flow 2: `Stripe: Create Subscription` (`0a31e459-0909-41b0-8286-2aecc763fe29`)
- **Trigger:** Webhook `POST /flows/trigger/0a31e459-0909-41b0-8286-2aecc763fe29`
- **Request Payload:**
  ```json
  {
    "email": "customer@example.com",
    "name": "Customer Name",
    "priceId": "price_1TcqK3GWvZAV5mbnBLpijcYO",
    "promotionCodeId": "promo_1UKiYz2aqrJCvAj3rpoKa3Kf",
    " promoCodeId": "promo_1UKiYz2aqrJCvAj3rpoKa3Kf",
    "approvedAmountDue": 0,
    "approvedCurrency": "usd",
    "verificationReference": "vref_1_...",
    "idempotencyKey": "vchk_..."
  }
  ```
- **Behavior:**
  1. Creates the Stripe subscription with `payment_behavior=default_incomplete` and expands `latest_invoice.payment_intent`, `latest_invoice.discounts`, and `pending_setup_intent`.
  2. Verifies `latest_invoice.amount_due <= approvedAmountDue`, `latest_invoice.currency === approvedCurrency`, and that `promotionCodeId` (when provided) actually produced a discount on `latest_invoice`.
  3. If any check fails—or if `approvedAmountDue === 0` produced a chargeable PaymentIntent—the flow immediately cancels the incomplete subscription (`DELETE /v1/subscriptions/:id`) and returns `{ aborted: true, clientSecret: null, invoiceAmountDue, ... }` so Stripe can never collect the unapproved charge.
  4. Runtime config variable `STRIPE_PREVIEW_CHECKOUT_FLOW` (or `window.__env.STRIPE_PREVIEW_CHECKOUT_FLOW`) points to `e8f9a1b2-3c4d-4e5f-8a6b-7c8d9e0f1a2b`.
