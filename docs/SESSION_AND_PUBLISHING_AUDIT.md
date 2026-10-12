# Session and first-post publishing audit

Reviewed October 12, 2026, from portal main `ff90e3829501c94ba9fd69d4879d90088287d499`.
Canonical VAMO reference: `Isla-Labs-DR/vamo-app` at `f5a9bca47d39bd5adc34c4ff8e9090e34e48b0b1`, read-only.

## Session lifetime

The portal has no inactivity logout timer. Directus determines access-token
expiry and refresh-token validity. Its documented defaults are `ACCESS_TOKEN_TTL=15m`
and `REFRESH_TOKEN_TTL=7d`; production overrides could differ and were not accessible
in this audit. The portal's 12-second login-request timeout is a network timeout,
not a signed-in session limit. Normal token renewal is scheduled two minutes before expiry.

Reference: https://docs.directus.io/self-hosted/config-options

## Confirmed causes and fixes

1. **Google/SSO refresh credentials erased.** `handleSsoTokens` stored access and
   refresh tokens, then called SDK `setToken(accessToken)`. Inspection of the installed
   Directus SDK confirms `setToken` overwrites storage with `refresh_token`, `expires`
   and `expires_at` set to null. Removed that call: the SDK already reads the shared
   browser storage. Existing affected sessions cannot recover a discarded refresh
   token; those users will need to sign in again after deployment.
2. **Temporary refresh errors forced logout.** Any refresh error previously cleared
   storage and redirected to login. Only explicit authentication rejection now does
   so. Network, rate-limit, permission and server errors preserve the session and
   background refresh retries after 30 seconds.
3. **Browser resume had no session check.** Focus/visibility resume now restores
   the session. Failed transient restoration preserves an already authenticated user.
   The app checks stored tokens before invoking SDK requests, because SDK `getToken`
   can refresh near expiry even when `autoRefresh` is false. Timers and listeners
   are cleaned up when the service is destroyed.
4. **Stripe flow calls bypassed refresh handling.** Flow calls now use `safeRequest`,
   retain HTTP status/Directus error codes, and rebuild Authorization after an expired
   token retry. No automatic retry is added for network/server failures of payment requests.
5. **First-post Publish skipped subscription and quota.** Both the editor and draft-card
   Publish action now use a shared publishing check. A missing/inactive subscription
   or exhausted quota sends the user to Billing with a saved draft ID. Draft saving
   does not require a subscription. Updating an already published event does not
   consume a new slot. Lookup failures block publishing and preserve editor content.
6. **Checkout had no return-to-draft path.** Billing explains the saved draft and offers
   Return to draft. Successful new subscription checkout resumes the draft only when
   the subscription lookup confirms active/trialing status. No automatic publishing
   or payment occurs: Publish rechecks entitlement.

## Canonical publishing contracts

- Subscription lookup uses the existing user-email Directus flow; provider tier
  labels alone do not grant publishing access.
- Post limits come from `settings.plan_limits`, matching VAMO `StripeService.getPlanLimits`.
- Usage uses VAMO's provider/status/date_updated aggregate and 32-day lookback from
  currentPeriodEnd. This preserves existing source behavior rather than redefining
  billing-cycle semantics.
- Additional-post credits come from the existing quota flow. A publish covered by
  an additional-post slot sets canonical `addon_expires_at` to 30 days; included slots
  clear that field. No new prices, backend flows or schema fields are introduced.
- Invalid/unavailable quota configuration does not default to free publishing.

## Validation and limits

Focused regression suites cover Google credentials, rejected versus transient
refresh, browser resume, retry behavior, Stripe flow token retry, new/unsubscribed
publishing, inactive subscriptions, quota exhaustion, additional credits, draft-card
publishing and return-to-draft checkout. Network calls are mocked and unmocked external
requests are blocked by the repository test setup. Existing canonical payload tests
are also run, plus the production build and Wrangler deployment dry run.

Production Google login, real subscription purchases and the backend's effective TTL
configuration were not exercised. Frontend gates match the existing app contract;
this does not audit or replace backend authorization or atomically reserve quota
across concurrent browser tabs. No production data/settings changes or deployment
were performed during this audit.
