# VAMO Business Portal — Sign in with Apple Security Audit & Staging Readiness

**Repository:** `weiskristen-hash/vamo-business-portal`  
**Branch:** `feature/apple-web-signin`  
**PR:** [#59](https://github.com/weiskristen-hash/vamo-business-portal/pull/59)  
**Directus Apple Sign-In Flow ID:** `7adc18dc-af9b-43d5-a2b7-2c7770760ec8`  
**Status:** **BLOCKED — SECURITY** & **BLOCKED — CONFIGURATION** (for `staging-business.vamo-app.com`)

---

## 1. Executive Summary

1. **Frontend Implementation & Defense-in-Depth Hardening Complete:**
   - The Business Portal frontend (`AppleAuthService`, `AuthService`, `LoginComponent`, `RegisterComponent`, `OnboardingComponent`) uses the official Apple JS SDK (`appleid.auth.js`) with `usePopup: true`, Services ID `com.vamoapp.vamomobile.signin`, and Return URL `https://business.vamo-app.com/auth/callback`.
   - `AppleAuthService.verifyIdentityToken()` enforces browser-boundary verification before any token is sent to Directus:
     - 3-part JWT structure and header validation (`alg === "RS256"`, non-empty `kid`)
     - Cryptographic **RS256 signature verification** against Apple's published JWKS (`https://appleid.apple.com/auth/keys`) via the standard W3C Web Crypto API (`crypto.subtle.importKey` / `crypto.subtle.verify` with `RSASSA-PKCS1-v1_5` and `SHA-256`)
     - Issuer validation (`iss === "https://appleid.apple.com"`)
     - Audience validation (`aud` includes `"com.vamoapp.vamomobile.signin"`)
     - Expiration (`exp`) and issued-at (`iat`) validation
     - Nonce validation (matching either raw `nonce` or lowercase SHA-256 hex digest of `nonce`, and rejecting tokens that omit `nonce`)
     - CSRF `state` validation
2. **Critical Backend Security Blocker Verified (Read-Only):**
   - Read-only inspection of Directus Flow `7adc18dc-af9b-43d5-a2b7-2c7770760ec8` on `https://api.vamo-app.com` (and `https://quepasa-api.c1oud7.de`) confirms that Operation `c190232c-757d-4b45-8978-4c95bce51917` (`decode_jwt`) base64url-decodes the JWT payload and checks `iss`, `aud`, and `exp`, **but never verifies the JWT's RS256 cryptographic signature against Apple's JWKS**.
3. **Why an External Business Portal Verifier Cannot Prevent Endpoint Bypass:**
   - Because `POST https://api.vamo-app.com/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8` is a public webhook (`trigger: "webhook"`, `accountability: "all"`) called directly by clients without a shared proxy secret or gateway restriction, **any external verifier controlled solely by the Business Portal can be bypassed by calling the Directus webhook endpoint directly**.
   - Per the Section 5 Stop Condition, production deployment is marked **BLOCKED — SECURITY** until signature verification is enforced at the `api.vamo-app.com` boundary or inside Directus Flow `7adc18dc-af9b-43d5-a2b7-2c7770760ec8`.

---

## 2. Verified Backend Security Findings (Read-Only Inspection)

### 2.1 Missing RS256 Signature Verification (`c190232c-757d-4b45-8978-4c95bce51917`)
In Flow `7adc18dc-af9b-43d5-a2b7-2c7770760ec8` (`Apple Sign In`), the root operation `decode_jwt` (`c190232c-757d-4b45-8978-4c95bce51917`) executes:
```js
const parts = identityToken.split('.');
if (parts.length !== 3) throw new Error('Invalid JWT format');

const payload = JSON.parse(b64urlDecode(parts[1]));

if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid issuer: ' + payload.iss);
const validAudiences = ['com.vamoapp.vamomobile', 'com.vamoapp.vamomobile.signin'];
if (!validAudiences.includes(payload.aud)) throw new Error('Invalid audience: ' + payload.aud);
if (payload.exp * 1000 < Date.now()) throw new Error('Apple token expired');
```
- `parts[0]` (JWT header) and `parts[2]` (RS256 signature) are completely ignored.
- Unlike VAMO's Google Sign-In Flow (`aceed368-a6ee-4c27-9fa6-fe6c8c60a1c7`), which executes `GET https://oauth2.googleapis.com/tokeninfo?id_token=...` (`1b9a230f-4598-4d5d-bfcb-2647b5516f38`) so Google's servers verify the signature before claims are trusted, the Apple flow performs no JWKS lookup (`https://appleid.apple.com/auth/keys`) and no RSA signature check.

### 2.2 Public Endpoint Bypass & Account Takeover Exposure
- The webhook endpoint `POST https://api.vamo-app.com/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8` is publicly reachable with `accountability: "all"`.
- An attacker who knows any VAMO user's email address or `apple_user_id` can construct an unsigned/forged 3-part token with:
  - `"iss": "https://appleid.apple.com"`
  - `"aud": "com.vamoapp.vamomobile.signin"` (or `"com.vamoapp.vamomobile"`)
  - `"exp": <future_timestamp>`
  - `"sub": "<arbitrary_or_target_sub>"`
  - `"email": "<victim_email>"`
- Sending this token directly to `POST https://api.vamo-app.com/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8` bypasses the Business Portal entirely, matches the victim in `find_user` (`7c5c5fdd-28ae-491e-b9de-7f378defc295`), overwrites the victim's `password` and `apple_user_id` in `update_user` (`da11cbf0-f87a-427e-a441-14f6b745854f`), and returns a valid Directus `access_token` and `refresh_token`.

### 2.3 Account-Linking & Credential Side Effects in Flow `7adc18dc-af9b-43d5-a2b7-2c7770760ec8`
1. **Password Clobbering on Existing Accounts (`da11cbf0-f87a-427e-a441-14f6b745854f`):**
   - `update_user` updates `directus_users` with `"password": "{{ prepare.newToken }}"` (a UUID generated via `Math.random()`) so that `do_login` (`81aa64fc-9ce2-450d-9004-139f08dbeaa4`) can call `POST /auth/login` with that password.
   - If an existing VAMO business owner previously registered with email + password and later signs in with Apple, their email/password login password is overwritten with a random UUID.
2. **Returning Apple Logins When `email` Claim Is Omitted (`81aa64fc-9ce2-450d-9004-139f08dbeaa4`):**
   - `do_login` sends `{"email":"{{ decode_jwt.email }}","password":"{{ prepare.newToken }}"}` instead of using the matched user's stored email (`user.email` from `find_user`). If Apple omits `email` from the JWT payload on a subsequent login, `do_login` fails even when `find_user` matched by `apple_user_id`.

---

## 3. Architectural Assessment: Can Verification Be Secured Outside Directus?

| Architecture Option | Protects Browser UI? | Prevents Direct Bypass of `api.vamo-app.com`? | Requires Directus / `api.vamo-app.com` Change? | Viable Under Current Restrictions? |
|---|---|---|---|---|
| **A. Browser-Only WebCrypto JWKS Verifier (`AppleAuthService`)** | Yes (defense-in-depth) | **No** — attacker calls `/flows/trigger/7adc18dc-...` directly | No | Implemented as defense-in-depth only; **does not resolve backend vulnerability** |
| **B. Separate Business Portal Worker / Proxy Verifier (`business.vamo-app.com/api/auth/apple`)** | Yes | **No** — `/flows/trigger/7adc18dc-...` on `api.vamo-app.com` remains public for iOS and accepts direct requests without proxy authentication | Yes (would require Directus shared secret or IP/route restriction) | **No** — creates false sense of security while leaving public Directus endpoint bypassable |
| **C. Cloudflare Worker / Gateway Route on `api.vamo-app.com/flows/trigger/7adc18dc-*`** | Yes | **Yes** — intercepts all iOS & Web requests at the `api.vamo-app.com` edge before Directus | Requires Cloudflare edge route on `api.vamo-app.com` (zero Directus changes) | Recommended if Directus flows cannot be edited |
| **D. In-Flow JWKS Fetch + RSA Signature Check in Directus (`7adc18dc-af9b-43d5-a2b7-2c7770760ec8`)** | Yes | **Yes** — enforces cryptographic verification inside Directus itself | Requires updating 1–2 operations in Directus Flow `7adc18dc-...` | Recommended smallest backend fix |

---

## 4. Smallest Possible Remediation Proposal

### Option 1 (Recommended Smallest Fix): Update Directus Flow `7adc18dc-af9b-43d5-a2b7-2c7770760ec8`
1. **Add a `request` operation (`fetch_apple_keys`) as the root operation:**
   - Method: `GET`
   - URL: `https://appleid.apple.com/auth/keys`
   - Resolve: `decode_jwt` (`c190232c-757d-4b45-8978-4c95bce51917`)
2. **Update `decode_jwt` (`c190232c-757d-4b45-8978-4c95bce51917`) to verify the RS256 signature:**
   - Parse `header = JSON.parse(b64urlDecode(parts[0]))` and require `header.alg === 'RS256'` and `header.kid`.
   - Select the matching RSA key from `data.fetch_apple_keys.data.keys` where `k.kid === header.kid && k.kty === 'RSA'`.
   - Perform PKCS#1 v1.5 RSA-SHA256 verification of `parts[2]` over `${parts[0]}.${parts[1]}` (either via `globalThis.crypto.subtle` if available in the Directus Node runtime, or via a 35-line pure-JS `BigInt` modular exponentiation `sig^e mod n` + SHA-256 digest comparison that runs in any sandboxed VM without `node:crypto`).
   - Require `payload.email_verified === true || payload.email_verified === 'true'` when matching by email.
3. **Update `prepare` (`79bbf48e-96b9-4868-9a0a-94a994ed4a7b`) and `do_login` (`81aa64fc-9ce2-450d-9004-139f08dbeaa4`):**
   - Return `email: user?.email ?? data.decode_jwt.email` from `prepare` and use `{{ prepare.email }}` in `do_login` so returning Apple users whose JWT omits `email` still authenticate cleanly.

### Option 2 (Zero Directus Modification): Cloudflare Worker on `api.vamo-app.com`
If Directus flows must remain untouched, bind a minimal Cloudflare Worker route to `api.vamo-app.com/flows/trigger/7adc18dc-af9b-43d5-a2b7-2c7770760ec8*` that:
1. Parses `identity_token` from the JSON request body.
2. Fetches and caches `https://appleid.apple.com/auth/keys`.
3. Verifies the RS256 signature using Cloudflare Workers' native `crypto.subtle`, validates `iss === "https://appleid.apple.com"`, `aud` in `["com.vamoapp.vamomobile", "com.vamoapp.vamomobile.signin"]`, and `exp`.
4. Returns `401 Unauthorized` on any invalid/unsigned token, and only forwards cryptographically verified requests to the origin Directus server.

---

## 5. Business Staging Environment & Apple Callback Readiness

Inspection of deployment configuration (`wrangler.jsonc`, `src/environments/environment.ts`, `src/environments/environment.development.ts`) and read-only HTTP inspection of `https://staging-business.vamo-app.com`:

1. **Separate Business Staging Environment Exists:**
   - Deployed at `https://staging-business.vamo-app.com` (Cloudflare HTTPS, HTTP 200).
2. **Apple Services ID Domain & Return URL Compatibility (`BLOCKED — CONFIGURATION` for Staging):**
   - Apple Web Services ID `com.vamoapp.vamomobile.signin` currently has only the production domain and return URL registered:
     - Registered Website Domain: `business.vamo-app.com`
     - Registered Return URL: `https://business.vamo-app.com/auth/callback`
   - Apple's JS SDK (`usePopup: true`) validates both the requesting origin (`window.location.origin`) and `redirectURI` against the Services ID configuration in Apple Developer.
   - To exercise real Apple Sign-In popups on `https://staging-business.vamo-app.com`, Apple Developer configuration for `com.vamoapp.vamomobile.signin` must add:
     - Website Domain: `staging-business.vamo-app.com`
     - Return URL: `https://staging-business.vamo-app.com/auth/callback`
3. **Staging Directus Data Isolation Warning:**
   - The current bundle deployed to `https://staging-business.vamo-app.com` is built with `src/environments/environment.ts` (`directusUrl: "https://api.vamo-app.com"`, live Stripe publishable key `pk_live_...`).
   - Consequently, authenticating via Apple Sign-In on `https://staging-business.vamo-app.com` will create or update real user records in **production Directus (`https://api.vamo-app.com`)** unless staging is pointed to `https://quepasa-api.c1oud7.de` (`dev_directus`).
