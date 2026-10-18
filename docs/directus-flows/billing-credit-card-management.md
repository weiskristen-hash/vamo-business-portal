# VAMO Business Portal — Directus Flow Contract for Credit-Card Management

## 1. Existing Flow Audit & Development Verification Summary

We audited the Directus instances (`prod_directus` at `https://api.vamo-app.com` and `dev_directus` at `https://quepasa-api.c1oud7.de`) and verified complete development isolation on `dev_directus` before installing and testing the card-management flows:

| Environment | Host | Stripe Key Mode | Isolation Status |
|---|---|---|---|
| `dev_directus` | `https://quepasa-api.c1oud7.de` | **TEST mode (`livemode: false`)** | Confirmed isolated test Stripe account; no operations forward to production |
| `prod_directus` | `https://api.vamo-app.com` | LIVE mode (`livemode: true`) | Read-only inspected; untouched |

### Verified Development Directus Flow IDs (`https://quepasa-api.c1oud7.de`)

| Flow Name | Runtime Config Key | `dev_directus` Flow ID | `prod_directus` Status |
|---|---|---|---|
| **Stripe - Create SetupIntent** | `stripeCreateSetupIntentFlow` | `b1c4e8a2-7f3d-4e9a-8c1b-2d5f6a9e0c31` | Not yet promoted (`''` in `environment.ts`) |
| **Stripe - Finalize Card Setup** | `stripeFinalizeSetupIntentFlow` | `c2d5f9b3-8e4a-4f0b-9d2c-3e6a7b0f1d42` | Not yet promoted (`''` in `environment.ts`) |
| **Stripe - Set Default Payment Method** | `stripeSetDefaultPaymentMethodFlow` | `d3e6a0c4-9f5b-4a1c-8e3d-4f7b8c1a2e53` | Not yet promoted (`''` in `environment.ts`) |
| **Stripe - Get Payment Methods** | `stripeGetPaymentMethodsFlow` | `44946457-c8cd-42e2-98b2-a7a0672d59d3` | Active in prod (needs default metadata upgrade on promotion) |
| **Stripe - Detach Payment Method** | `stripeDetachPaymentMethodFlow` | `9845ee00-779b-4f6b-9e07-fb8f175f945d` | Active in prod (needs ownership + renewal protection upgrade on promotion) |

---

## 2. Installed & Verified Flow Specifications

Complete, importable Directus flow and operation definitions (including deterministic operation UUIDs and 1-to-1 unique `resolve`/`reject` links required by `directus_operations`) are provided in [`billing-credit-card-management.flows.json`](./billing-credit-card-management.flows.json).

### 2.1 `Stripe - Create SetupIntent` (`b1c4e8a2-7f3d-4e9a-8c1b-2d5f6a9e0c31`)
- **Trigger:** Webhook (`POST /flows/trigger/b1c4e8a2-7f3d-4e9a-8c1b-2d5f6a9e0c31`, `accountability: "all"`, `return: "format_setup_intent"`)
- **Request Payload:** `{}` (Server resolves authenticated user from `$accountability.user` — never trusts client-supplied email or customer ID)
- **Operations:**
  1. `read_user` (`item-read` on `directus_users`, key `{{ $accountability.user }}`, fields `["email", "first_name", "last_name"]`)
  2. `extract_user` (`exec`): Validates authenticated email and URL-encodes `email` and `name`.
  3. `get_customer` (`request` `GET https://api.stripe.com/v1/customers?email={{ extract_user.encodedEmail }}&limit=1`)
  4. `extract_existing_customer` (`exec`): Extracts `customerId` if present.
  5. `is_customer_missing` (`condition`): Checks if `customerId` is null (`resolve` -> `create_customer`, `reject` -> `resolve_customer_id`).
  6. `create_customer` (`request` `POST https://api.stripe.com/v1/customers` with `email` and `name`).
  7. `resolve_customer_id` (`exec`): Resolves the existing or newly created `customerId`.
  8. `create_setup_intent` (`request` `POST https://api.stripe.com/v1/setup_intents`):
     - Body: `customer={{ resolve_customer_id.customerId }}&payment_method_types[]=card&usage=off_session`
  9. `format_setup_intent` (`exec`):
     - Returns:
       ```json
       {
         "setupIntentId": "seti_...",
         "clientSecret": "seti_..._secret_...",
         "customerId": "cus_..."
       }
       ```

---

### 2.2 `Stripe - Finalize Card Setup` (`c2d5f9b3-8e4a-4f0b-9d2c-3e6a7b0f1d42`)
- **Trigger:** Webhook (`POST /flows/trigger/c2d5f9b3-8e4a-4f0b-9d2c-3e6a7b0f1d42`, `accountability: "all"`, `return: "verify_setup"`)
- **Request Payload:**
  ```json
  {
    "setupIntentId": "seti_..."
  }
  ```
- **Operations:**
  1. `read_user` (`item-read` on `directus_users`, key `{{ $accountability.user }}`, fields `["email"]`)
  2. `validate_input` (`exec`): Validates authenticated email and `setupIntentId` format (`^seti_[A-Za-z0-9_]+$`).
  3. `get_customer` (`request` `GET https://api.stripe.com/v1/customers?email={{ validate_input.encodedEmail }}&limit=1`)
  4. `extract_customer_id` (`exec`): Extracts `customerId`.
  5. `get_setup_intent` (`request` `GET https://api.stripe.com/v1/setup_intents/{{ validate_input.setupIntentId }}?expand[]=payment_method`)
  6. `verify_setup` (`exec`):
     - Verifies `setupIntent.customer === customerId` (belongs to the authenticated user's customer).
     - Verifies `setupIntent.status === "succeeded"`.
     - Verifies `setupIntent.payment_method` is present (`pm_...`).
     - Returns on success:
       ```json
       {
         "verified": true,
         "setupIntentId": "seti_...",
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
     - Returns on failure (`requires_payment_method`, `requires_action`, `canceled`, or ownership mismatch):
       ```json
       {
         "verified": false,
         "error": true,
         "code": "SETUP_INTENT_NOT_SUCCEEDED",
         "status": "requires_payment_method",
         "message": "Card setup has not succeeded."
       }
       ```

---

### 2.3 `Stripe - Set Default Payment Method` (`d3e6a0c4-9f5b-4a1c-8e3d-4f7b8c1a2e53`)
- **Trigger:** Webhook (`POST /flows/trigger/d3e6a0c4-9f5b-4a1c-8e3d-4f7b8c1a2e53`, `accountability: "all"`, `return: "$last"`)
- **Request Payload:**
  ```json
  {
    "paymentMethodId": "pm_...",
    "subscriptionId": "sub_..."
  }
  ```
  *(Note: `subscriptionId` is optional; if omitted, the flow looks up any `active`/`trialing`/`past_due` subscription for the authenticated user's Stripe customer.)*
- **Operations:**
  1. `read_user` -> `validate_input` -> `get_customer` -> `extract_customer`: Resolves the authenticated user's Stripe `customerId`.
  2. `get_active_subscriptions` (`GET https://api.stripe.com/v1/subscriptions?{{ extract_customer.subsQuery }}`)
  3. `get_payment_method` (`GET https://api.stripe.com/v1/payment_methods/{{ validate_input.paymentMethodId }}`)
  4. `verify_and_prepare` (`exec`): Verifies `paymentMethod.customer === customerId` and resolves the customer's `active`/`trialing`/`past_due` subscription (verifying subscription ownership if `subscriptionId` was passed).
  5. `check_valid` (`condition`): Routes invalid/mismatched requests to `format_invalid_response` without mutating Stripe.
  6. `update_customer_default` (`POST https://api.stripe.com/v1/customers/{{ verify_and_prepare.customerId }}`):
     - Body: `invoice_settings[default_payment_method]={{ verify_and_prepare.paymentMethodId }}`
  7. `has_subscription_to_update` (`condition`) -> `update_subscription_default` (`POST https://api.stripe.com/v1/subscriptions/{{ verify_and_prepare.subscriptionId }}`):
     - Body: `default_payment_method={{ verify_and_prepare.paymentMethodId }}`
  8. `format_response` (`exec`):
     - Returns:
       ```json
       {
         "updated": true,
         "defaultPaymentMethodId": "pm_...",
         "customerDefaultUpdated": true,
         "subscriptionDefaultUpdated": true,
         "subscriptionId": "sub_..."
       }
       ```

---

### 2.4 `Stripe - Get Payment Methods` (`44946457-c8cd-42e2-98b2-a7a0672d59d3`)
- Backward-compatible with existing `paymentMethods` callers and returns verified default/renewal metadata:
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
    "defaultPaymentMethodId": "pm_...",
    "customerDefaultPaymentMethodId": "pm_...",
    "subscriptionDefaultPaymentMethodId": "pm_...",
    "defaultVerified": true
  }
  ```

---

### 2.5 `Stripe - Detach Payment Method` (`9845ee00-779b-4f6b-9e07-fb8f175f945d`)
- Verifies `pm.customer === customerId` before detaching.
- Checks whether the customer has an `active`, `trialing`, or `past_due` subscription whose effective renewal payment method (`subscription.default_payment_method || customer.invoice_settings.default_payment_method`) matches `paymentMethodId`.
- If `paymentMethodId` is the active renewal card, blocks detachment and returns:
  ```json
  {
    "detached": false,
    "error": true,
    "code": "RENEWAL_CARD_PROTECTED",
    "message": "Cannot remove the active subscription renewal card. Select another renewal card first."
  }
  ```
- Otherwise detaches the card and returns:
  ```json
  {
    "detached": true,
    "paymentMethodId": "pm_..."
  }
  ```
