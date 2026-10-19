# VAMO Business Portal — Isolated Verified Stripe Checkout Architecture & Compatibility Report

**Status:** Implemented & Verified on `feat/verified-stripe-checkout` (PR #62)  
**Production Deployment:** NOT PERFORMED (Awaiting explicit approval)  
**Shared Directus Flows Modified:** **NONE** (`0a31e459-0909-41b0-8286-2aecc763fe29` and `3b580ce9-5023-446f-ad4c-55c8ee5db4fd` remain 100% untouched)

---

## 1. Architecture Investigation Findings

1. **Portal Hosting & Deployment (`wrangler.jsonc` & `package.json`):**
   - `vamo-business-portal` is an Angular 21 application deployed via Cloudflare Workers (`wrangler deploy`).
   - By adding `main: "src/server/worker.ts"` and `assets.run_worker_first: ["/api/checkout/*"]` in `wrangler.jsonc`, the portal hosts its own isolated server-side checkout API at `/api/checkout/preview` and `/api/checkout/create-subscription` on the same origin (`https://business.vamo-app.com/api/checkout/*`), while `runtimeConfig.checkoutApiBaseUrl` can also point to an external Railway/Node service if deployed separately.
   - `src/server/**/*.ts` is excluded from `tsconfig.app.json` so server-side code is never bundled into the browser JavaScript output.

2. **How Existing VAMO Subscriptions & Entitlements Work:**
   - **Customer Linkage:** Neither `directus_users` nor `providers` requires a new schema column for Stripe IDs. All existing VAMO Directus Flows (`stripeGetSubscriptionFlow` `a48e3dee-3d94-471b-804f-16ada69737cf`, `stripeChangeSubscriptionFlow` `2b1a4494-8999-4c27-b70e-ddcc47bb16f3`, `stripeCancelSubscriptionFlow` `3eff0cae-6cfd-4cce-9ae9-e273295cb93c`, `stripeGetBillingHistoryFlow` `f8be3b19-62c9-4d0d-91ca-701bdaeaac7e`, `stripeGetPaymentMethodsFlow` `44946457-c8cd-42e2-98b2-a7a0672d59d3`) resolve the Stripe customer dynamically via `GET https://api.stripe.com/v1/customers?email=<user.email>&limit=1` and query `GET https://api.stripe.com/v1/subscriptions?customer=<customer.id>&status=all`.
   - **Entitlement & Tier Recognition:**
     - The VAMO mobile app and business portal determine authoritative subscription status by calling `stripeGetSubscriptionFlow` with the user's email and mapping the Stripe `product.name` (`Starter`, `Basic`, `Advanced`) to the corresponding tier and `settings.plan_limits`.
     - After checkout confirmation (or immediate `$0.00` activation), the portal calls the existing `setProviderTierFlow` (`bbdfad27-9768-4b62-95d2-b319205945cf`) to sync `providers.subscription_tier` in Directus and refreshes the authenticated user session.

---

## 2. Isolated Portal Checkout Endpoints (`src/server/verified-checkout-backend.ts`)

### Endpoint A — `POST /api/checkout/preview`
1. **Directus User Authentication:** Verifies the caller's `Authorization: Bearer <token>` against `GET ${DIRECTUS_URL}/users/me?fields=id,email,first_name,last_name,status,provider_link.id,provider_link.name,provider_link.subscription_tier`.
2. **Customer Ownership Verification:** Ensures any client-supplied `email` or `providerId` matches the authenticated Directus user and resolves any existing Stripe customer by email (`GET /v1/customers?email=...`).
3. **Price & Promotion Eligibility Validation:**
   - Validates that the selected Stripe `Price` and its expanded `Product` are active.
   - When a promotion code is provided, validates in Stripe:
     - Active status (`promo.active === true`, `coupon.valid === true`)
     - Expiration (`promo.expires_at`, `coupon.redeem_by`)
     - Redemption limits (`max_redemptions` vs `times_redeemed` on both PromotionCode and Coupon)
     - Product applicability (`coupon.applies_to.products` must include the selected plan's product ID)
     - Customer restriction (`promo.customer` / `promo.restrictions.customer` must match the resolved Stripe customer ID)
     - Minimum amount (`promo.restrictions.minimum_amount` and currency)
     - First-time transaction restriction (`promo.restrictions.first_time_transaction` checked against paid invoices and prior subscriptions)
4. **Authoritative Stripe Invoice Preview:** Calls `POST /v1/invoices/create_preview` and verifies that any submitted promotion code actually reduced the invoice preview total.
5. **Signed Verification Reference:** Returns a short-lived (10-minute) HMAC-SHA256 signed `verificationReference` (`vref_2_<base64url_payload>.<signature>`) bound to `userId`, `email`, `customerId`, `priceId`, `promotionCodeId`, `subtotal`, `discountAmount`, `tax`, `amountDueToday`, `renewalAmount`, `currency`, `issuedAt`, `expiresAt`, and `nonce`.

### Endpoint B — `POST /api/checkout/create-subscription`
1. **Authentication & Cryptographic Verification:** Authenticates the user via Directus `/users/me` and verifies the HMAC-SHA256 signature, expiration, and exact field bindings (`userId`, `email`, `priceId`, `promotionCodeId`, `approvedAmountDue`, `approvedCurrency`) of `verificationReference`. Rejects tampered or expired references before making any Stripe call.
2. **Idempotency & Active Subscription Protection:**
   - Enforces replay protection keyed by `verificationReference` nonce and `idempotencyKey`.
   - Checks existing customer subscriptions so a duplicate active subscription is never created and preexisting active subscriptions are never modified or canceled.
   - Verifies saved `paymentMethodId` ownership (`pm.customer === customer.id`) when a saved card is selected.
3. **Pre-Charge Hard Stop on First Invoice:**
   - Creates the subscription with `payment_behavior: 'default_incomplete'` and `payment_settings[save_default_payment_method]: 'on_subscription'`.
   - Inspects `latest_invoice` **before** returning any `clientSecret`:
     - `latest_invoice.amount_due <= approvedAmountDue`
     - `latest_invoice.currency === approvedCurrency`
     - If `approvedAmountDue === 0`: verifies `latest_invoice.amount_due === 0` and blocks any chargeable PaymentIntent (`pi_...` or `amount > 0`).
     - If `promotionCodeId` was approved: verifies the promotion/discount is present on the subscription and first invoice.
   - If any check fails, immediately cancels the newly created incomplete subscription (`DELETE /v1/subscriptions/:id`), logs `amount_mismatch_blocked` with secrets redacted, and returns `clientSecret: null`.

---

## 3. Required Environment Variables for Deployment

Configure the following server-side secrets on the Cloudflare Worker (`wrangler secret put ...`) or standalone Railway service before production rollout:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | **Yes** | Stripe secret key (`sk_live_...` in production, `sk_test_...` in staging). Server-side only; never exposed to browser. |
| `STRIPE_CHECKOUT_VERIFICATION_SECRET` | Recommended | Dedicated 32+ byte HMAC secret used to sign `verificationReference` tokens (defaults to `STRIPE_SECRET_KEY` if omitted). |
| `DIRECTUS_URL` | Optional | Directus base URL used to verify `Bearer` tokens via `/users/me` (defaults to `https://api.vamo-app.com`). |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins (defaults to `https://business.vamo-app.com,http://localhost:4200`). |
