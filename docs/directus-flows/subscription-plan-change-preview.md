# Directus Flow Specification — `Stripe - Preview Subscription Plan Change`

## 1. Overview & Architecture

This specification defines the Phase 2 read-only Directus Flow for subscription upgrade invoice previews in the VAMO Business Portal:

- **Flow Name:** `Stripe - Preview Subscription Plan Change`
- **Flow ID (Prepared for Quepasa Import):** `e5f7b1d5-0a6c-4b2d-9f4e-5a8c9d2b3f64`
- **Exportable Definition:** [`docs/directus-flows/subscription-plan-change-preview.flows.json`](./subscription-plan-change-preview.flows.json)
- **Trigger:** Webhook (`POST /flows/trigger/e5f7b1d5-0a6c-4b2d-9f4e-5a8c9d2b3f64`, `accountability: "all"`, `return: "$last"`)
- **Mutation Footprint:** **Strictly read-only.** Calls `POST https://api.stripe.com/v1/invoices/create_preview` (which calculates an ephemeral preview invoice without modifying any Stripe subscription, customer, schedule, or creating a collectible invoice).
- **Existing Mutation Flow Preservation:** Does **not** modify `2b1a4494-8999-4c27-b70e-ddcc47bb16f3` (`Stripe - Change Subscription`).

---

## 2. Security & Ownership Verification Controls

1. **Authenticated Directus Access Required (`read_user` + `validate_request`):**
   - Reads `directus_users` using `{{ $accountability.user }}`.
   - Rejects unauthenticated callers (`!email`) with `{ verified: false, error: true, errorCode: "UNAUTHORIZED" }`.
2. **Server-Side Customer Resolution (`get_customer` + `extract_customer`):**
   - Resolves the Stripe customer strictly from the authenticated Directus user's server-side `email` (`GET https://api.stripe.com/v1/customers?email={{ validate_request.encodedEmail }}&limit=1`).
   - Ignores any browser-supplied `customerId` or `customerEmail`.
3. **Subscription & Item Ownership Verification (`get_subscriptions` + `verify_ownership_and_build_preview_body`):**
   - Fetches the authenticated customer's subscriptions from Stripe (`GET /v1/subscriptions?customer={{ extract_customer.customerId }}&status=all&limit=10`).
   - Verifies that `subscriptionId` belongs to `customerId` and has status `active` or `trialing` (`SUBSCRIPTION_OWNERSHIP_MISMATCH` otherwise).
   - Verifies that `subscriptionItemId` matches the subscription's item (`SUBSCRIPTION_ITEM_MISMATCH` otherwise).
   - Verifies that `currentPriceId` matches the subscription item's current Stripe Price ID (`CONCURRENT_SUBSCRIPTION_CHANGE` otherwise).
   - Verifies that `currentPeriodEnd` (when supplied) matches `activeSub.current_period_end` (`PREVIEW_STALE_PERIOD_CHANGED` otherwise).
4. **Target Price Validation (`get_prices` + `verify_ownership_and_build_preview_body`):**
   - Fetches active recurring prices from Stripe (`GET /v1/prices?active=true&type=recurring&expand[]=data.product&limit=20`).
   - Verifies that `newPriceId` is an active recurring price with an active product (`UNSUPPORTED_TARGET_PRICE` otherwise).
   - Verifies that `targetPrice.currency === currentPrice.currency` (`CURRENCY_MISMATCH` otherwise) and `targetPrice.unit_amount > currentPrice.unit_amount` (`NOT_AN_UPGRADE` otherwise).

---

## 3. Stripe Invoice Preview Request Parameters

 Operation `create_invoice_preview` calls `POST https://api.stripe.com/v1/invoices/create_preview` with `application/x-www-form-urlencoded` parameters matching the upgrade proration behavior of `2b1a4494-8999-4c27-b70e-ddcc47bb16f3`:

| Parameter | Value | Purpose |
|---|---|---|
| `customer` | `{{ customerId }}` | Server-verified Stripe customer ID (`cus_...`) |
| `subscription` | `{{ subscriptionId }}` | Server-verified active subscription ID (`sub_...`) |
| `subscription_details[items][0][id]` | `{{ subscriptionItemId }}` | Existing subscription item ID (`si_...`) |
| `subscription_details[items][0][price]` | `{{ targetPriceId }}` | Validated target recurring Stripe Price ID (`price_...`) |
| `subscription_details[proration_behavior]` | `always_invoice` | Matches `proration_behavior=always_invoice` in `2b1a4494-8999-4c27-b70e-ddcc47bb16f3` |
| `subscription_details[proration_date]` | `{{ prorationTimestamp }}` | Current Unix timestamp in seconds |

---

## 4. Request & Response Payloads

### Request Payload (`POST /flows/trigger/<STRIPE_PREVIEW_PLAN_CHANGE_FLOW>`)

```json
{
  "subscriptionId": "sub_...",
  "subscriptionItemId": "si_...",
  "currentPriceId": "price_...",
  "newPriceId": "price_...",
  "targetPriceId": "price_...",
  "isUpgrade": true,
  "currentPeriodStart": 1700000000,
  "currentPeriodEnd": 1702500000
}
```

### Authoritative Success Response

```json
{
  "verified": true,
  "customerId": "cus_...",
  "subscriptionId": "sub_...",
  "subscriptionItemId": "si_...",
  "currentPriceId": "price_...",
  "targetPriceId": "price_...",
  "newPriceId": "price_...",
  "currency": "usd",
  "subtotal": 2450,
  "prorationDelta": 2450,
  "discountAmount": 0,
  "tax": 0,
  "amountDueToday": 2450,
  "totalAmountDue": 2450,
  "renewalAmount": 5900,
  "renewalInterval": "month",
  "previewTimestamp": 1701250000,
  "effectiveDate": 1701250000,
  "currentPeriodStart": 1700000000,
  "currentPeriodEnd": 1702500000,
  "nextBillingDate": 1702500000,
  "expiresAt": 1701250300000,
  "promoSupported": false,
  "chargeAmountEnforcedByServer": false
}
```

---

## 5. Preview-to-Charge Safety Gate (`chargeAmountEnforcedByServer`)

### Why `chargeAmountEnforcedByServer` is `false` in Phase 2

The existing subscription-change mutation Flow (`2b1a4494-8999-4c27-b70e-ddcc47bb16f3` — `Stripe - Change Subscription`) currently executes:

```http
POST https://api.stripe.com/v1/subscriptions/{{ $trigger.body.subscriptionId }}
Content-Type: application/x-www-form-urlencoded

items[0][id]={{ $trigger.body.subscriptionItemId }}&items[0][price]={{ $trigger.body.newPriceId }}&proration_behavior=always_invoice&payment_behavior=error_if_incomplete
```

Because `2b1a4494-8999-4c27-b70e-ddcc47bb16f3` does **not** yet:
1. Verify `$accountability.user` ownership of `subscriptionId` before mutating,
2. Forward `proration_date` from the preview to lock the proration timestamp, or
3. Verify that the resulting invoice amount matches the customer-approved `approvedAmountDue` before charging the default payment method,

the Phase 2 preview Flow sets `"chargeAmountEnforcedByServer": false`.

When `chargeAmountEnforcedByServer === false`, the Business Portal:
- Displays the full Stripe-authoritative upgrade invoice preview breakdown (current plan, new plan, proration adjustment, existing applicable discounts, tax, prorated amount due today, future renewal amount, effective date, and verified default payment method), **and**
- Keeps immediate upgrade submission blocked (`canConfirmPlanChange() === false`) with a clear safety notice explaining that server-side approved-amount enforcement is required before immediate charging.

### Minimum Additional Backend Safeguard Required for Later Phase

To enable `chargeAmountEnforcedByServer: true` in a later, separately approved backend phase on `2b1a4494-8999-4c27-b70e-ddcc47bb16f3`:
1. **Ownership & Default Card Check:** Read `directus_users` via `$accountability.user`, verify `subscription.customer === customerId`, and verify an attached, non-expired default payment method exists.
2. **Proration Timestamp & Approved Amount Reconciliation:**
   - Accept `prorationDate` (`previewTimestamp`), `approvedAmountDue`, and `approvedCurrency` in `2b1a4494-8999-4c27-b70e-ddcc47bb16f3`.
   - Reject if `prorationDate` is older than 300 seconds (5 minutes) or does not fall within `[subscription.current_period_start, subscription.current_period_end)`.
   - Call `POST /v1/invoices/create_preview` with the exact `proration_date={{ prorationDate }}` and `proration_behavior=always_invoice` immediately before mutating.
   - Verify `previewInvoice.amount_due === approvedAmountDue` and `previewInvoice.currency === approvedCurrency` (aborting without mutating the subscription if they differ).
   - Pass `proration_date={{ prorationDate }}` into `POST /v1/subscriptions/{{ subscriptionId }}` so Stripe bills the exact locked proration amount.
3. Once those safeguards are active on `2b1a4494-8999-4c27-b70e-ddcc47bb16f3`, update `format_preview_response` in `e5f7b1d5-0a6c-4b2d-9f4e-5a8c9d2b3f64` to return `"chargeAmountEnforcedByServer": true`.

---

## 6. Quepasa Staging Deployment Steps (Requires Separate Approval)

1. Verify Quepasa (`https://quepasa-api.c1oud7.de`) is using Stripe test-mode keys (`sk_test_...`).
2. Import or create Flow `e5f7b1d5-0a6c-4b2d-9f4e-5a8c9d2b3f64` (`Stripe - Preview Subscription Plan Change`) and its 13 operations from [`subscription-plan-change-preview.flows.json`](./subscription-plan-change-preview.flows.json).
3. Update operation `862a4b1c-9f88-4f28-b27b-e979b6f2eb9b` (`extract_customer_id`) and operation `23cd3258-b87c-4c9f-886a-ef2a1542bdbd` (`format_methods`) in Flow `44946457-c8cd-42e2-98b2-a7a0672d59d3` (`Stripe - Get Payment Methods`) from [`billing-credit-card-management.flows.json`](./billing-credit-card-management.flows.json).
4. Set `STRIPE_PREVIEW_PLAN_CHANGE_FLOW: 'e5f7b1d5-0a6c-4b2d-9f4e-5a8c9d2b3f64'` in `src/environments/environment.development.ts` (keeping `src/environments/environment.ts` empty until production approval).
