# VAMO Business Portal — Isolated Verified Stripe Checkout Architecture & Deployment Readiness Report

**Status:** Hardened & Verified on `feat/verified-stripe-checkout` (PR #62)  
**Verdict:** **`READY FOR CONTROLLED TESTING`**  
**Production Deployment:** NOT PERFORMED (Awaiting explicit approval)  
**Shared Directus Flows Modified:** **NONE** (`0a31e459-0909-41b0-8286-2aecc763fe29` and `3b580ce9-5023-446f-ad4c-55c8ee5db4fd` remain 100% untouched)

---

## 1. Architecture Summary

```
Business Portal Angular Frontend (BillingComponent + StripeService)
   │
   │  POST /api/checkout/preview
   │  POST /api/checkout/create-subscription
   ▼
Cloudflare Worker Entrypoint (src/server/worker.ts → src/server/verified-checkout-backend.ts)
   ├─ Directus Auth & Ownership Verification: GET ${DIRECTUS_URL}/users/me
   ├─ Stripe Customer Resolution & Deterministic Idempotency: GET/POST /v1/customers
   ├─ Authoritative Coupon & Invoice Preview: GET /v1/promotion_codes, POST /v1/invoices/create_preview
   ├─ HMAC-SHA256 Signed Verification Reference (vref_2_<payload>.<sig>)
   ├─ Cross-Isolate Subscription State Inspection & Safe Incomplete Reuse: GET /v1/subscriptions
   └─ Pre-Charge Verified Subscription Creation: POST /v1/subscriptions (payment_behavior=default_incomplete)
```

1. **Same-Origin Portal Worker (`wrangler.jsonc`, `src/server/worker.ts`):**
   - `vamo-business-portal` is an Angular 21 SPA served by Cloudflare Workers (`wrangler deploy`).
   - `wrangler.jsonc` configures `"main": "src/server/worker.ts"`, `"assets": { "directory": "./dist/vamo-business-portal/browser", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/checkout/*"] }`.
   - Requests matching `/api/checkout/*` are handled directly by the Worker (`handleCheckoutApiRequest`), while all other routes delegate to `env.ASSETS.fetch(request)` so Angular SPA deep links (`/app/billing`, `/register?promo=FOUNDERS90`) and static assets continue to work identically.
   - `src/server/**/*.ts` is excluded in `tsconfig.app.json` so server-side code is never bundled into browser assets.

---

## 2. Duplicate Checkout Protection Design (Cross-Isolate Safe)

To prevent duplicate subscriptions across concurrent requests, multi-tab submissions, retries after network timeouts, and multiple Cloudflare Worker isolates:

1. **Cryptographic Checkout Binding (`verificationReference`):**
   - Every `/api/checkout/preview` response issues an HMAC-SHA256 signed `verificationReference` (`vref_2_<base64url_payload>.<signature>`) with a 10-minute TTL and a unique `nonce` bound to `userId`, `email`, `customerId`, `priceId`, `promotionCodeId`, `subtotal`, `discountAmount`, `tax`, `amountDueToday`, `renewalAmount`, and `currency`.
2. **Layer 1 — Single-Isolate Fast Lock (`idempotencyStore`):**
   - Rejects immediate in-memory replays (`status === 'completed'`) or concurrent requests on the same isolate (`status === 'in_progress'` within 60s lock window) before making external calls.
3. **Layer 2 — Cross-Isolate Stripe Subscription State Inspection:**
   - Before calling `POST /v1/subscriptions`, the Worker queries `GET /v1/subscriptions?customer=<customer.id>&status=all&limit=10` (expanding `latest_invoice.payment_intent`, `latest_invoice.discounts`, `pending_setup_intent`, and `discounts`):
     - **Preexisting Subscription Protection:** All existing subscription IDs are recorded in `preexistingSubscriptionIds`. Any active/trialing/past_due/unpaid subscription from a different checkout is blocked with `409 EXISTING_ACTIVE_SUBSCRIPTION`. **Preexisting subscriptions are never canceled or modified under any failure path.**
     - **Cross-Isolate Completed Replay Detection:** If a subscription with matching `metadata.verification_nonce` (or `metadata.idempotency_key`) is already `active`, `trialing`, `past_due`, or `unpaid`, the Worker rejects the duplicate submission with `409 DUPLICATE_CHECKOUT_SUBMISSION`.
     - **Safe Retry After Interrupted Checkout:** If a prior attempt created an `incomplete` subscription with matching `metadata.verification_nonce`, the Worker reuses that existing `incomplete` subscription (`reusedExistingIncompleteSubscription: true`) and runs full server-side `latest_invoice` verification instead of creating a second subscription.
4. **Layer 3 — Deterministic Stripe Idempotency Keys:**
   - Customer creation uses `Idempotency-Key: cust_create_${authUser.id}`.
   - Subscription creation uses `Idempotency-Key: sub_create_${authUser.id}_${refPayload.nonce}`.
   - If two Cloudflare Worker isolates race concurrently with the same checkout token, Stripe enforces atomic idempotency and any `409 idempotency_key_in_use` / `lock_timeout` response is cleanly mapped to `409 DUPLICATE_CHECKOUT_SUBMISSION`.

---

## 3. Exact Coupon Verification Design

1. **No `discountTotal > 0` Fallback:**
   - `isPromotionPresentOnSubscriptionOrInvoice` strictly verifies the exact `expectedPromotionCodeId` (`promo_...`) and/or `expectedCouponId` (`coupon_...`) across authoritative Stripe discount objects (`invoice.discounts`, `invoice.discount`, `invoice.total_discount_amounts[].discount`, `sub.discounts`, `sub.discount`).
   - Any unrelated positive discount or different promotion/coupon ID is immediately flagged as a conflict and rejected (`PROMOTION_NOT_APPLIED_IN_PREVIEW` during preview, `PROMOTION_NOT_APPLIED_ON_INVOICE` during subscription creation).
2. **Full Stripe Promotion & Coupon Restriction Enforcement (at Preview AND Pre-Creation):**
   - Active flags (`promo.active === true`, `coupon.valid === true`)
   - Expiration timestamps (`promo.expires_at`, `coupon.redeem_by`) re-verified immediately before `POST /v1/subscriptions`
   - Redemption caps (`promo.max_redemptions`, `coupon.max_redemptions` vs `times_redeemed`)
   - Product restrictions (`coupon.applies_to.products` expanded on `GET /v1/promotion_codes/:id?expand[]=coupon.applies_to`)
   - Customer restrictions (`promo.customer`, `promo.restrictions.customer`)
   - Minimum amount restrictions (`promo.restrictions.minimum_amount` & currency)
   - First-time transaction restrictions (`promo.restrictions.first_time_transaction` checked against paid invoices and non-incomplete-expired subscriptions)
3. **100% Discount Enforcement:**
   - When a 100% coupon (`percent_off >= 100`) is applied, the backend verifies that the pre-tax invoice amount is `$0.00` (`amountDueToday === tax`, or `0` when `tax === 0`). If Stripe produces any non-zero pre-tax amount or chargeable PaymentIntent, checkout is aborted and the incomplete subscription is immediately canceled.

---

## 4. Pre-Charge Payment Safety Analysis

1. **Saved & Customer-Level Default Cards Never Charged Before Invoice Verification:**
   - `POST /v1/subscriptions` is always called with `payment_behavior: 'default_incomplete'` and **without** `default_payment_method` or `default_source`, even when the customer selected a saved card (`paymentMethodId`) or has a customer-level default payment method.
   - Under `payment_behavior: 'default_incomplete'`, Stripe creates the subscription in `status: 'incomplete'` (whenever `amount_due > 0`) and creates `latest_invoice.payment_intent` unconfirmed (`requires_payment_method`), preventing synchronous server-side charges during subscription creation.
2. **Server-Side `latest_invoice` & `PaymentIntent` Gate (Zero Automatic Refunds):**
   - Before returning any `clientSecret` to the browser, the Worker verifies:
     - `actualCurrency === approvedCurrency`
     - `actualAmountDue <= approvedAmountDue`
     - `paymentIntent.amount <= approvedAmountDue`
     - If `approvedAmountDue === 0`: `actualAmountDue === 0` and no chargeable `PaymentIntent` (`pi_...` or `amount > 0`) exists
     - If `promotionCodeId` was approved: `isPromotionPresentOnSubscriptionOrInvoice` confirms the exact promotion/coupon is applied on the created subscription/invoice
   - If any unpaid invoice check fails, the Worker blocks checkout, returns `clientSecret: null`, cancels **only** the newly created unpaid (`incomplete`) subscription, and logs `amount_mismatch_blocked` (`chargePrevented: true`).
3. **Already-Paid Unexpected Invoice Incident Handling (No Automatic Refunds):**
   - No automatic `POST /v1/refunds` calls exist anywhere in the checkout workflow.
   - If Stripe ever reports that a charge has **already occurred** (`invoiceAmountPaid > 0`, `latest_invoice.status === 'paid'`, or `paymentIntent.status` in `['succeeded', 'processing', 'requires_capture']`), the Worker:
     - Does **not** initiate a refund and does **not** cancel the already-paid subscription.
     - Does **not** claim that the charge was prevented (`chargePrevented: false`).
     - Emits a critical `payment_safety_incident` audit event containing `customerId`, `subscriptionId`, `invoiceId`, `paymentIntentId`, and `chargeId`, flagging `manualInvestigationRequired: true` and `manualRefundAuthorizationRequired: true`.
     - Returns `409 UNEXPECTED_PRE_VERIFICATION_CHARGE` with `clientSecret: null` and a safe customer-facing message instructing the customer not to pay again while support reviews the account.
4. **Post-Verification Saved Card Attachment for `$0.00` Subscriptions:**
   - For `$0.00` checkouts where a saved `paymentMethodId` was verified and no `pending_setup_intent` is required, the Worker attaches `default_payment_method` to the subscription via `POST /v1/subscriptions/:id` strictly **after** `latest_invoice` verification succeeds.

---

## 5. VAMO Mobile App & Directus Compatibility Findings

Read-only inspection of `Isla-Labs-DR/vamo-app` (`src/app/shared/services/stripe.service.ts`) and live Directus Flow definitions confirmed 100% compatibility:

| Requirement | VAMO Mobile App / Directus Contract | Isolated Portal Checkout Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Customer Lookup** | `GET /v1/customers?email=<user.email>&limit=1` | Resolves existing customer by normalized Directus user email or creates customer with canonical `authUser.email` | **Verified Compatible** |
| **Subscription Discovery** | `stripeGetSubscriptionFlow` (`a48e3dee-3d94-471b-804f-16ada69737cf`) queries `GET /v1/subscriptions?customer=<cus_id>&status=all&limit=10` and prioritizes `active`/`trialing`/`past_due` | Creates standard Stripe subscription under the same customer and cancels any failed `incomplete` subscription so stale `incomplete` records never shadow active plans | **Verified Compatible** |
| **Tier Mapping (`Starter` / `Basic` / `Advanced`)** | Mobile app `resolveTierFromProductName()` maps Stripe `product.name` (`Starter`, `Basic`, `Advanced`) and syncs `providers.subscription_tier` via `setProviderTierFlow` (`bbdfad27-9768-4b62-95d2-b319205945cf`) | Uses the exact same Stripe `Price` / `Product` catalog and calls `setProviderTierFlow` only after verified checkout completion | **Verified Compatible** |
| **Plan Change / Cancel / Billing History / Saved Cards** | Directus Flows `2b1a4494-...`, `3eff0cae-...`, `f8be3b19-...`, `44946457-...` | All operate on the customer's standard Stripe subscription and `default_payment_method` without modification | **Verified Compatible** |
| **Shared Directus Flows** | `0a31e459-0909-41b0-8286-2aecc763fe29` & `3b580ce9-5023-446f-ad4c-55c8ee5db4fd` | **Zero modifications made** | **Verified Untouched** |

---

## 6. Cloudflare Staging & Production Configuration Audit

### Confirmed in Repository (`wrangler.jsonc`, `package.json`, `README.md`)
- **Cloudflare Worker Name:** `vamo-business-portal`
- **Production Branch:** `main` (per `README.md`)
- **Build Command:** `npm run build` (`ng build`, outputs to `./dist/vamo-business-portal/browser`)
- **Deploy Command:** `npm run deploy` (`wrangler deploy`)
- **Worker Entrypoint:** `"main": "src/server/worker.ts"`
- **Static Assets & SPA Fallback:**
  - `"directory": "./dist/vamo-business-portal/browser"`
  - `"binding": "ASSETS"`
  - `"not_found_handling": "single-page-application"`
  - `"run_worker_first": ["/api/checkout/*"]`
- **Local Wrangler Dry-Run Verification:** `npx wrangler deploy --dry-run` succeeds, bundling `src/server/worker.ts` (`43.13 KiB` / `8.85 KiB` gzip) with `ASSETS` binding and zero build warnings.

### Live Cloudflare Account Settings Requiring Operator Confirmation Before Rollout
*(Local CLI `npx wrangler whoami` is unauthenticated in this workspace, so live Cloudflare Dashboard state is explicitly separated from repository config below)*:
1. **Staging / Preview Environment Strategy:** `wrangler.jsonc` currently defines the top-level `vamo-business-portal` Worker without a separate `env.staging` block. Confirm whether Cloudflare Workers Builds preview URLs (`*-vamo-business-portal.<subdomain>.workers.dev`) or a dedicated `env.staging` Worker will be used for controlled testing.
2. **Worker Secret Bindings:** Confirm that `STRIPE_SECRET_KEY` (`sk_test_...` for preview/staging, `sk_live_...` for production) and `STRIPE_CHECKOUT_VERIFICATION_SECRET` (32+ byte random HMAC secret) are bound in the Cloudflare Worker settings before routing traffic.
3. **Custom Domain Routing:** Confirm in Cloudflare Dashboard that `business.vamo-app.com` is attached as a Custom Domain / Worker route to `vamo-business-portal`.

---

## 7. Required Environment Variables & Secrets

| Variable / Secret | Type | Required | Purpose |
| :--- | :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Worker Secret (`wrangler secret put`) | **Yes** | Server-side Stripe secret key (`sk_test_...` in staging/preview, `sk_live_...` in production). Never exposed to client bundle. |
| `STRIPE_CHECKOUT_VERIFICATION_SECRET` | Worker Secret (`wrangler secret put`) | **Recommended** | Dedicated 32+ byte HMAC-SHA256 secret for signing `verificationReference` tokens (falls back to `STRIPE_SECRET_KEY` if unset). |
| `DIRECTUS_URL` | Worker Env Var | Optional | Directus API base URL for `/users/me` token verification (defaults to `https://api.vamo-app.com`). |
| `ALLOWED_ORIGINS` | Worker Env Var | Optional | Comma-separated allowed CORS origins (defaults to `https://business.vamo-app.com,http://localhost:4200`). |

---

## 8. Controlled Rollout & Verification Checklist

1. **Set Secrets in Target Cloudflare Worker Environment:**
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_CHECKOUT_VERIFICATION_SECRET
   ```
2. **Deploy to Controlled Preview / Staging First:**
   - Run `npm run build` followed by `npx wrangler deploy --dry-run` to confirm bundle integrity.
   - Deploy to preview/staging and verify:
     - Deep link `/register?promo=FOUNDERS90` and `/app/billing` load the Angular SPA via `ASSETS`.
     - Valid 100% coupon (`FOUNDERS90`) previews `$0.00` due today and activates subscription without charging or returning a `pi_...` client secret.
     - Valid partial coupon previews exact discounted amount and charges exact approved amount.
     - Expired or ineligible coupon displays localized error and blocks discount claim.
     - Confirming with a saved card or new card charges no more than the approved amount.
     - VAMO mobile app and portal immediately recognize the resulting subscription tier (`Starter`, `Basic`, `Advanced`).
3. **Rollback Plan:**
   - Rollback is instantaneous via `npx wrangler rollback` in Cloudflare Workers (or reverting PR #62), with zero database migrations or Directus Flow changes to unwind.
