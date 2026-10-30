# VAMO Business Portal — Production Readiness & Directus Flow Contract: `Stripe - Preview Invoice`

## 1. Verified Flow Definition (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`)

The Quepasa staging Directus Flow **`Stripe - Preview Invoice`** has been inspected across all 10 operations and verified to be read-only (zero Stripe or Directus side effects) and aligned with the Business Portal subscription plan-change workflow.

| Property | Verified Value |
|---|---|
| **Flow Name** | `Stripe - Preview Invoice` |
| **Expected Flow UUID** | `f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` |
| **Status** | `active` |
| **Trigger** | `webhook` (`POST /flows/trigger/f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) |
| **Accountability** | `all` (populates `$accountability.user` from the caller's Directus Bearer JWT) |
| **Trigger Options** | `{"method": "POST", "async": false, "return": "format_preview"}` |
| **Entry Operation Key** | `read_user` |
| **Reachable Operations** | `10 / 10` (`0` orphans) |
| **Side Effects** | **None** — calls read-only `GET /v1/customers`, `GET /v1/subscriptions`, `GET /v1/prices/:id`, and `POST /v1/invoices/create_preview` (`Stripe-Version: 2025-04-30.preview`). Creates no Stripe Invoice, PaymentIntent, Customer, or Subscription mutation. |

### Request Contract

Authenticated `POST /flows/trigger/f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` with `Authorization: Bearer <directus_access_token>`:

```json
{
  "priceId": "price_...",
  "promotionCode": "promo_..."
}
```

- `priceId` *(required)*: Target recurring Stripe Price ID (`/^price_[A-Za-z0-9]+$/`).
- `promotionCode` *(optional)*: Stripe Promotion Code ID (`/^promo_[A-Za-z0-9]+$/`), applied only when `mode === "new"` (no active subscription yet). Existing subscription coupons/discounts on `sub` are automatically included by Stripe when previewing against `subscription=<sub.id>`.
- Customer identity and subscription ownership are resolved strictly from `$accountability.user` via `directus_users` -> Stripe customer email lookup; client-supplied customer or subscription IDs are never trusted.

### Response Contract (All Monetary Fields in Stripe Minor Currency Units / Cents)

- **Upgrade (`mode: "upgrade"`):**
  ```json
  {
    "error": false,
    "mode": "upgrade",
    "currency": "usd",
    "subtotal": 1500,
    "discount": 0,
    "tax": 0,
    "total": 1500,
    "lines": [
      { "description": "Unused time on Starter Plan after ...", "amount": -1450 },
      { "description": "Remaining time on Basic Plan after ...", "amount": 2950 }
    ],
    "amountDueNow": 1500,
    "nextAmount": 5900,
    "nextDate": 1764547200,
    "prorationDate": 1763251200
  }
  ```
- **Scheduled Downgrade (`mode: "downgrade"`):**
  ```json
  {
    "error": false,
    "mode": "downgrade",
    "currency": "usd",
    "subtotal": 2900,
    "discount": 0,
    "tax": 0,
    "total": 2900,
    "lines": [
      { "description": "1 × Starter Plan (at $29.00 / month)", "amount": 2900 }
    ],
    "amountDueNow": 0,
    "nextAmount": 2900,
    "nextDate": 1764547200,
    "prorationDate": null
  }
  ```
- **Structured Refusal (`INVALID_PRICE`, `SUBSCRIPTION_NOT_FOUND`, `SAME_PLAN`, `PREVIEW_FAILED`):**
  ```json
  {
    "error": true,
    "code": "SAME_PLAN",
    "message": "This is already your current plan."
  }
  ```

---

## 2. Required Operations & Trigger Permissions

### Trigger & Accountability Permissions
1. Flow trigger must be `webhook` with `"method": "POST"`, `"async": false`, `"return": "format_preview"`, and `accountability: "all"`.
2. Directus role/policy for Business Portal authenticated users must permit triggering webhook flows (standard Directus authenticated session token via `Authorization: Bearer <jwt>`). No direct client read permission on `directus_users` beyond standard self-session is required because `read_user` executes with `"permissions": "$full"` scoped strictly to `["{{ $accountability.user }}"]`.
3. Unauthenticated callers receive no valid `$accountability.user`; `extract_user_email` substitutes an unmatchable sentinel address so Stripe customer lookup never executes with an empty filter.

### 10-Operation Execution Graph

1. **`read_user`** (`item-read` -> `resolve`: `extract_user_email`, `reject`: `extract_user_email`)
   - Reads `["email"]` from `directus_users` for key `["{{ $accountability.user }}"]` using `permissions: "$full"`.
2. **`extract_user_email`** (`exec` -> `resolve`: `get_customer`, `reject`: `null`)
   - Extracts trimmed `email` from `read_user` and URL-encodes it (substituting an unmatchable sentinel email when unauthenticated).
3. **`get_customer`** (`request` -> `resolve`: `extract_customer`, `reject`: `extract_customer`)
   - `GET https://api.stripe.com/v1/customers?email={{ extract_user_email.encodedEmail }}&limit=1` (`Stripe-Version: 2023-10-16`).
4. **`extract_customer`** (`exec` -> `resolve`: `get_customer_subscriptions`, `reject`: `null`)
   - Extracts `customerId`, validates `priceId` (`/^price_[A-Za-z0-9]+$/`) and optional `promotionCode` (`/^promo_[A-Za-z0-9]+$/`), and builds `subsQuery` (`customer=<id>&status=all&limit=10&expand[0]=data.items.data.price` or `customer=cus_none&limit=1`).
5. **`get_customer_subscriptions`** (`request` -> `resolve`: `get_new_price`, `reject`: `get_new_price`)
   - `GET https://api.stripe.com/v1/subscriptions?{{ extract_customer.subsQuery }}` (`Stripe-Version: 2023-10-16`).
6. **`get_new_price`** (`request` -> `resolve`: `build_preview`, `reject`: `build_preview`)
   - `GET https://api.stripe.com/v1/prices/{{ extract_customer.priceId }}` (`Stripe-Version: 2023-10-16`).
7. **`build_preview`** (`exec` -> `resolve`: `preview_allowed`, `reject`: `null`)
   - Validates target recurring price (`active`, `recurring`, `unit_amount > 0`).
   - Selects the customer's subscription in `['active', 'trialing', 'past_due']`.
   - Refuses `SUBSCRIPTION_NOT_FOUND` (missing subscription item) or `SAME_PLAN` (`current.id === price.id`).
   - For existing subscriptions, sets `isUpgrade = price.unit_amount > (current.unit_amount || 0)`, `now = Math.floor(Date.now() / 1000)`, `subscription_details[proration_behavior] = isUpgrade ? 'always_invoice' : 'none'`, and (for upgrades) `subscription_details[proration_date] = String(now)`.
8. **`preview_allowed`** (`condition` -> `resolve`: `create_preview`, `reject`: `format_preview`)
   - Filter: `{"build_preview": {"allowed": {"_eq": true}}}`.
9. **`create_preview`** (`request` -> `resolve`: `format_preview`, `reject`: `null`)
   - `POST https://api.stripe.com/v1/invoices/create_preview` with `Content-Type: application/x-www-form-urlencoded` and `Stripe-Version: 2025-04-30.preview`, body `{{ build_preview.body }}`.
10. **`format_preview`** (`exec` -> `resolve`: `null`, `reject`: `null`)
    - Normalizes minor-unit `subtotal`, `discount`, `tax`, `total`, `lines`, `amountDueNow`, `nextAmount`, `nextDate`, and `prorationDate` (or structured `{ error: true, code, message }`).

---

## 3. Required Directus Environment Variables (By Name Only)

The Flow requires the following Directus server environment variable to be present and exposed to Flow template interpolation:

- `STRIPE_SECRET_KEY`

*(No additional Directus `$env` variables are referenced by `Stripe - Preview Invoice`.)*

---

## 4. Exact Flow ID Expected by Production Frontend

- **Expected Flow UUID:** `f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`
- **Frontend Configuration Path (`src/environments/environment.ts`):**
  - `STRIPE_PREVIEW_INVOICE_FLOW_ID: 'f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67'`
  - `STRIPE_PREVIEW_INVOICE_ENABLED: false` *(kept `false` until the production Directus Flow migration below is completed and verified)*
  - `STRIPE_PREVIEW_INVOICE_FLOW: ''` *(optional explicit override)*
- **Staging Configuration (`src/environments/environment.development.ts`):**
  - `STRIPE_PREVIEW_INVOICE_FLOW_ID: 'f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67'`
  - `STRIPE_PREVIEW_INVOICE_ENABLED: true`
  - `STRIPE_PREVIEW_INVOICE_FLOW: 'f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67'`

While `STRIPE_PREVIEW_INVOICE_ENABLED` is `false` in `environment.ts`, the production Business Portal **does not invoke** `/flows/trigger/f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` and preserves the existing honest **`Amount due today: Unable to verify`** + explicit customer acknowledgment fallback. Even if enabled prematurely or if the Flow is temporarily disabled (`404` / `403` / `5xx`), `StripeService.previewInvoice()` catches the error and falls back cleanly without breaking plan changes.

---

## 5. Quepasa vs. Production Differences That Must Be Addressed Before Enabling in Production

1. **Missing `Stripe - Preview Invoice` Flow (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) in Production (`https://api.vamo-app.com`):**
   - Exists and is `active` on Quepasa (`https://quepasa-api.c1oud7.de`), completely absent on `https://api.vamo-app.com`.
   - Must be imported into `https://api.vamo-app.com` preserving exact UUID `f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` and all 10 operations.
2. **Incompatible `Stripe - Change Subscription Plan` (`2b1a4494-8999-4c27-b70e-ddcc47bb16f3`) Between Quepasa and Production:**
   - **Quepasa (`entry_key: read_user`, 25 reachable operations):** Resolves customer & subscription ownership from `$accountability.user` via `verify_change`, validates `newPriceId`, and accepts `body.prorationDate` (`&proration_date=<pd>` when integer within `[max(now - 3600, sub.current_period_start), now]`) on `upgrade_plan` (`POST /v1/subscriptions/{{ verify_change.subscriptionId }}` with `proration_behavior=always_invoice{{ verify_change.prorationParam }}`). Forwarding `prorationDate` from `Stripe - Preview Invoice` guarantees that the executed upgrade invoice matches the previewed amount to the cent.
   - **Production (`entry_key: is_upgrade_check`, 16 reachable operations):** Still runs an older operation graph that reads `$trigger.body.subscriptionId` / `$trigger.body.subscriptionItemId` directly without `read_user` -> `verify_change` ownership checks and **ignores `prorationDate`** on `upgrade_plan`.
   - **Required Action:** Promote the verified Quepasa `Stripe - Change Subscription Plan` (`2b1a4494-8999-4c27-b70e-ddcc47bb16f3`) operation graph to production alongside `Stripe - Preview Invoice` (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) **before** flipping `STRIPE_PREVIEW_INVOICE_ENABLED: true` in `src/environments/environment.ts`.
3. **Measurability via VAMO Environment Compatibility Dashboard:**
   - Both conditions above are directly measurable in the **VAMO Environment Compatibility Dashboard**:
     - `Stripe - Preview Invoice` (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) transitions from **`Missing`** -> **`Compatible`** (`active`, `reachable=10/10`, `return="format_preview"`).
     - `Stripe - Change Subscription Plan` (`2b1a4494-8999-4c27-b70e-ddcc47bb16f3`) transitions from **`Incompatible`** -> **`Compatible`** (`entry_key: read_user`, `verify_change` + `prorationParam` active).

---

## 6. Safe Production Verification & Rollback Procedure

### Pre-Enablement Verification (Zero Live Charges)
1. Import `Stripe - Preview Invoice` (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) and promote the updated `Stripe - Change Subscription Plan` (`2b1a4494-8999-4c27-b70e-ddcc47bb16f3`) on `https://api.vamo-app.com`.
2. Run the **VAMO Environment Compatibility Dashboard** audit (read-only) and confirm both `f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` and `2b1a4494-8999-4c27-b70e-ddcc47bb16f3` report **`Compatible`** with `status: active` and zero unexpected drift.
3. Because `Stripe - Preview Invoice` calls `POST /v1/invoices/create_preview` (read-only), invoke `/flows/trigger/f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67` once using an authenticated internal VAMO test/admin business session with a valid live `priceId` and verify:
   - HTTP `200` with `error: false`, integer minor-unit amounts (`amountDueNow`, `subtotal`, `tax`, `nextAmount`), valid `prorationDate`, and **zero** new Invoices or PaymentIntents created in Stripe Dashboard.
4. Set `STRIPE_PREVIEW_INVOICE_ENABLED: true` in `src/environments/environment.ts` in a dedicated activation PR and deploy the Business Portal.
5. Open **Billing -> Change Plan** in production on an internal account, select an upgrade and a downgrade **without clicking Confirm**, and verify the live preview summary renders exact proration credits, charges, Amount Due Today, and Next Renewal date/amount.

### Instant Rollback Procedure
- **No-redeploy Directus toggle:** Set `Stripe - Preview Invoice` (`f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`) `status` to `inactive` in Directus Admin. Directus immediately returns HTTP `403`/`404` on `/flows/trigger/f1e2d3c4-5b6a-4789-8a0b-1c2d3e4f5a67`, and `BillingComponent` automatically degrades to the verified **`Amount due today: Unable to verify`** (`Preview unavailable`) state with the customer acknowledgment checkbox intact — subscription upgrades and scheduled downgrades continue to work without interruption.
- **Frontend config rollback:** Revert `STRIPE_PREVIEW_INVOICE_ENABLED` to `false` in `src/environments/environment.ts` and redeploy Cloudflare Pages so the frontend stops calling the preview endpoint altogether.
