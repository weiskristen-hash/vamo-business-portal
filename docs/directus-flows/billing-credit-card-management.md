# Directus Contract Verification & Reviewable Flow Definitions: Business Billing Credit-Card Management

## 1. Authoritative Inspection Summary

Using authorized read-only administrative inspection of `/flows` and `/operations` on both `prod_directus` (`https://api.vamo-app.com`) and `dev_directus` (`https://quepasa-api.c1oud7.de`), all 36 Directus flows and 265 operations were audited without invoking any mutation endpoints.

### 1.1 Existing Flows Relevant to Payment Methods & Billing

| Flow Name | Flow UUID (`prod` & `dev`) | Status | Trigger | Permission | Current Contract & Findings |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Stripe - Get Payment Methods` | `44946457-c8cd-42e2-98b2-a7a0672d59d3` | `active` | `POST /flows/trigger/44946457-c8cd-42e2-98b2-a7a0672d59d3` | `$full` | Resolves `$accountability.user` email from `directus_users`, looks up `GET /v1/customers?email=...&limit=1`, fetches `GET /v1/payment_methods?customer={{customerId}}&type=card&limit=10`, deduplicates by `card.fingerprint`, and returns `{ paymentMethods: [{ id, brand, last4, expMonth, expYear }] }`. **Gap:** Does not return `defaultPaymentMethodId` or `isRenewalCard`. |
| `Stripe - Detach Payment Method` | `9845ee00-779b-4f6b-9e07-fb8f175f945d` | `active` | `POST /flows/trigger/9845ee00-779b-4f6b-9e07-fb8f175f945d` | `$full` | Accepts `{ paymentMethodId }`, resolves customer by `$accountability.user` email, checks `if (!customerId)` and `if (!pmId)`, and calls `POST /v1/payment_methods/{{pmId}}/detach`. **Gap:** Does not verify `pm.customer === customerId` on the PaymentMethod before detaching, and does not block detaching the effective renewal card on an active subscription. |
| `Stripe - Get Subscription` | `a48e3dee-3d94-471b-804f-16ada69737cf` | `active` | `POST /flows/trigger/a48e3dee-3d94-471b-804f-16ada69737cf` | `$full` | Returns `{ subscription: { subscriptionId, subscriptionItemId, status, cancelAtPeriodEnd, currentPeriodStart, currentPeriodEnd, plan, pendingPlanName, pendingPeriodEnd, pendingScheduleId } }`. Does not expose `default_payment_method`. |
| `Stripe - Create Subscription` | `0a31e459-0909-41b0-8286-2aecc763fe29` | `active` | `POST /flows/trigger/0a31e459-0909-41b0-8286-2aecc763fe29` | `$full` | Creates a subscription and only creates a `SetupIntent` when the first invoice is `$0` (`requiresSetup: true`). Cannot be used for standalone card setup without creating a subscription. |

### 1.2 Confirmed Absent Flows (Both `prod_directus` and `dev_directus`)

1. **Create SetupIntent / Save Payment Method (Standalone):** Absent.
2. **Finalize Card Setup / Verify SetupIntent:** Absent.
3. **Set Default Payment Method (Customer & Active Subscription):** Absent.
4. **Customer Billing Portal Session:** Absent.

---

## 2. Frontend Runtime Configuration Keys

No fake production flow UUIDs have been invented. The portal runtime configuration (`src/environments/environment.ts` and `src/app/core/config/runtime-config.ts`) reuses the existing flow UUIDs for listing/detaching cards and defines explicit runtime config keys for the three new flows:

- `stripeGetPaymentMethodsFlow`: `'44946457-c8cd-42e2-98b2-a7a0672d59d3'` (existing)
- `stripeDetachPaymentMethodFlow`: `'9845ee00-779b-4f6b-9e07-fb8f175f945d'` (existing)
- `stripeCreateSetupIntentFlow`: `''` (populated via `window.__VAMO_CONFIG__.stripeCreateSetupIntentFlow` once deployed)
- `stripeFinalizeSetupIntentFlow`: `''` (populated via `window.__VAMO_CONFIG__.stripeFinalizeSetupIntentFlow` once deployed)
- `stripeSetDefaultPaymentMethodFlow`: `''` (populated via `window.__VAMO_CONFIG__.stripeSetDefaultPaymentMethodFlow` once deployed)

---

## 3. Reviewable Directus Flow Contracts

Complete, import-ready Directus flow definitions (with Stripe secret keys parameterized as `<STRIPE_SECRET_KEY>`) are provided in [`billing-credit-card-management.flows.json`](./billing-credit-card-management.flows.json).

### 3.1 `Stripe - Create SetupIntent` (New Flow)

- **Trigger:** Webhook (`POST /flows/trigger/<stripeCreateSetupIntentFlow>`), Synchronous (`options.return = "$last"`), Permission: `$full` (authenticated user).
- **Request Payload:** `{}` (No client-supplied `customerId` or `email` is trusted).
- **Operations:**
  1. `read_user` (`item-read` on `directus_users`, key `{{$accountability.user}}`, fields `["id", "email", "first_name", "last_name", "provider"]`): Resolves the authenticated user and linked business provider.
  2. `prep_customer_lookup` (`exec`): Validates that the authenticated user has an email address and encodes it for Stripe lookup.
  3. `find_customer` (`request`): `GET https://api.stripe.com/v1/customers?email={{prep_customer_lookup.encodedEmail}}&limit=1`.
  4. `check_customer_exists` (`condition`): Branches on whether `find_customer.data.data[0].id` exists.
  5. `create_customer` (`request`, only if no customer exists): `POST https://api.stripe.com/v1/customers` with `email`, `name`, `metadata[directus_user_id]`, and `metadata[provider_id]`.
  6. `resolve_customer_id` (`exec`): Selects the existing or newly created Stripe `customer.id`.
  7. `create_setup_intent` (`request`): `POST https://api.stripe.com/v1/setup_intents` with:
     ```
     customer={{resolve_customer_id.customerId}}&payment_method_types[]=card&usage=off_session&metadata[directus_user_id]={{read_user.id}}
     ```
  8. `format_response` (`exec`): Returns:
     ```json
     {
       "setupIntentId": "seti_...",
       "clientSecret": "seti_..._secret_..."
     }
     ```

### 3.2 `Stripe - Finalize Card Setup` (New Flow)

- **Trigger:** Webhook (`POST /flows/trigger/<stripeFinalizeSetupIntentFlow>`), Synchronous (`options.return = "$last"`), Permission: `$full`.
- **Request Payload:** `{ "setupIntentId": "seti_..." }`.
- **Operations:**
  1. `read_user` (`item-read` on `directus_users`, key `{{$accountability.user}}`, fields `["id", "email"]`).
  2. `validate_input` (`exec`): Validates `setupIntentId` format (`^seti_[A-Za-z0-9_]+$`) and encodes user email.
  3. `find_customer` (`request`): `GET https://api.stripe.com/v1/customers?email={{validate_input.encodedEmail}}&limit=1`.
  4. `get_setup_intent` (`request`): `GET https://api.stripe.com/v1/setup_intents/{{validate_input.setupIntentId}}?expand[]=payment_method`.
  5. `verify_setup_intent` (`exec`):
     - Confirms `find_customer.data.data[0].id` matches `get_setup_intent.data.customer`.
     - Confirms `get_setup_intent.data.status === 'succeeded'`.
     - Confirms `get_setup_intent.data.payment_method` is an attached `card` PaymentMethod belonging to `customerId`.
     - Returns:
       ```json
       {
         "verified": true,
         "setupIntentId": "seti_...",
         "status": "succeeded",
         "paymentMethodId": "pm_...",
         "paymentMethod": {
           "id": "pm_...",
           "brand": "visa",
           "last4": "4242",
           "expMonth": 12,
           "expYear": 2028
         }
       }
       ```
     - If verification fails, returns `{ "verified": false, "error": true, "code": "SETUP_UNVERIFIED", "message": "Card setup could not be verified." }`.

### 3.3 `Stripe - Set Default Payment Method` (New Flow)

- **Trigger:** Webhook (`POST /flows/trigger/<stripeSetDefaultPaymentMethodFlow>`), Synchronous (`options.return = "$last"`), Permission: `$full`.
- **Request Payload:** `{ "paymentMethodId": "pm_...", "subscriptionId": "sub_..." }` (`subscriptionId` optional; server verifies customer ownership).
- **Operations:**
  1. `read_user` (`item-read` on `directus_users`, key `{{$accountability.user}}`, fields `["id", "email"]`).
  2. `validate_input` (`exec`): Validates `paymentMethodId` (`^pm_[A-Za-z0-9_]+$`).
  3. `find_customer` (`request`): `GET https://api.stripe.com/v1/customers?email={{validate_input.encodedEmail}}&limit=1`.
  4. `get_payment_method` (`request`): `GET https://api.stripe.com/v1/payment_methods/{{validate_input.paymentMethodId}}`.
  5. `verify_ownership` (`exec`): Confirms `get_payment_method.data.customer === customerId`. Throws/aborts if the card does not belong to the authenticated user's Stripe customer.
  6. `update_customer_default` (`request`): `POST https://api.stripe.com/v1/customers/{{verify_ownership.customerId}}` with body `invoice_settings[default_payment_method]={{validate_input.paymentMethodId}}`.
  7. `list_subscriptions` (`request`): `GET https://api.stripe.com/v1/subscriptions?customer={{verify_ownership.customerId}}&limit=10`.
  8. `select_active_subscription` (`exec`): Finds the active/trialing/past_due subscription for `customerId` (matching `subscriptionId` if supplied, or the primary active subscription).
  9. `has_active_subscription` (`condition`): Checks if `select_active_subscription.activeSubscriptionId` is non-null.
  10. `update_subscription_default` (`request`, when active subscription exists): `POST https://api.stripe.com/v1/subscriptions/{{select_active_subscription.activeSubscriptionId}}` with body `default_payment_method={{validate_input.paymentMethodId}}`.
      - **Safety guarantee:** Updates ONLY `default_payment_method` on the subscription. Does not modify `items`, `price`, `discounts`, `trial_end`, `billing_cycle_anchor`, or `schedule`, and does not pay or retry open invoices.
  11. `format_response` (`exec`): Returns:
      ```json
      {
        "updated": true,
        "defaultPaymentMethodId": "pm_...",
        "customerDefaultUpdated": true,
        "subscriptionDefaultUpdated": true,
        "subscriptionId": "sub_..."
      }
      ```

### 3.4 Backward-Compatible Updates to Existing Flows

#### A. `Stripe - Get Payment Methods` (`44946457-c8cd-42e2-98b2-a7a0672d59d3`)
- **Mobile-App Compatibility Preserved:** Continues returning `paymentMethods: [{ id, brand, last4, expMonth, expYear }]`.
- **Additions for Verified Renewal Card Badge:**
  - Also fetches `GET /v1/subscriptions?customer={{customerId}}&limit=5` (or reads `customer.invoice_settings.default_payment_method` from `find_customer`).
  - Computes `defaultPaymentMethodId = activeSub?.default_payment_method || customer?.invoice_settings?.default_payment_method || null`.
  - Returns:
    ```json
    {
      "paymentMethods": [
        {
          "id": "pm_...",
          "brand": "visa",
          "last4": "4242",
          "expMonth": 12,
          "expYear": 2028,
          "isDefault": true,
          "isRenewalCard": true
        }
      ],
      "defaultPaymentMethodId": "pm_..."
    }
    ```

#### B. `Stripe - Detach Payment Method` (`9845ee00-779b-4f6b-9e07-fb8f175f945d`)
- **Additions for Ownership & Renewal-Card Protection:**
  - Fetches `GET /v1/payment_methods/{{pmId}}` and verifies `pm.customer === customerId`.
  - Fetches `GET /v1/subscriptions?customer={{customerId}}&limit=5` and resolves the effective renewal payment method (`activeSub.default_payment_method || customer.invoice_settings.default_payment_method`) when an active/trialing/past_due subscription exists.
  - If `pmId === effectiveRenewalPaymentMethodId` on an active subscription, rejects without detaching:
    ```json
    {
      "detached": false,
      "error": true,
      "code": "RENEWAL_CARD_PROTECTED",
      "message": "Select another card for renewals before removing your active renewal card."
    }
    ```
