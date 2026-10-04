# VAMO Business Portal — Language & Translation Parity
## Phase 1 — Canonical Architecture Audit (read-only)

- **Portal base:** `main` @ `d463f96` (PR #17 merged — auth/onboarding styling, EN/ES UI i18n, Apple hidden, Google onboarding fix, no `?step=` bypass, canonical business-type labels: verified).
- **Branch:** `feature/language-translation-parity`
- **Canonical source:** `Isla-Labs-DR/vamo-app` local copy (`src/` only) — read only.
- **Live evidence:** anonymous (public-role) `GET` requests to `https://api.vamo-app.com` only. No credentials, no admin, no writes. Only IDs, field shapes, status values and counts were recorded — no content text, no personal data.
- **No runtime code was changed in this phase.**

Evidence legend: **[SRC]** canonical source · **[SCHEMA]** Directus field metadata (public `/fields`) · **[DATA]** public read of live rows · **[UNPROVEN]** cannot be proven without backend (Flow/extension) access.

---

## A. UI localization (static strings) — separate system

| Aspect | Canonical VAMO | Portal (`src/app/core/i18n/*`) | Parity |
|---|---|---|---|
| Engine | `@ngx-translate/core` + JSON (`assets/i18n/en.json`, `es.json`) [SRC] | Custom signal `I18nService` + TS dictionaries (`translations/en.ts`, `es.ts`, canonical keys + `PORTAL.*`) | Equivalent semantics, different engine (acceptable) |
| Languages / fallback | `['en','es']`, fallback `en` (`setFallbackLang`) [SRC `i18n.service.ts`] | same | ✅ |
| Startup order | `?lang=` (web only, persisted) → saved `vamo_lang` (Capacitor Preferences) → `Device.getLanguageCode()` → `en` [SRC] | `?lang=` → `localStorage.vamo_lang` → `navigator.language` → `en` | ✅ (storage backend differs; separate origin anyway) |
| Switching | `setLang()` → `translate.use()` + persist [SRC] | `setLang()` → signal + persist + `<html lang>` | ✅ |
| `?lang=` handoff | Set by `WebHandoffService` when native app opens web (`query.set(LANG_PARAM, lang)`) [SRC] | Read supported; no outbound handoff needed | ✅ |
| Selector location | Home top-right globe button (`home.page.html:24-31`) and Profile → Language tile (`profile.page.html:48-53`), modal "English (US)" / "Español" with flags [SRC] | EN/ES pill on Login, Register/Onboarding, No-Business only. **Not available inside the authenticated shell** | ❌ gap |
| Date locale | `dateLocale`: `en → en-US`, `es → es` used with `DatePipe` in consumer views [SRC] | `dateLocale`: `en → en-US`, `es → es-DO`; **never used**; dates hard-coded `toLocaleDateString('en-US')` in listings/billing | ❌ gap |
| Authenticated pages | All business pages use `translate` pipe [SRC] | Overview, Business Profile, Listings, Listing Editor, Billing, Shell/Sidebar/Topbar: **0 `translate` usages (English only)** | ❌ gap |
| Customer-safe errors | Mixed (some hard-coded English, e.g. `provider.service.ts` upload error) [SRC] | `CustomerErrorService` English only | ⚠️ partial in both |

---

## B. Dynamic content translation — architecture

**Data model is NOT a relational translations collection.** It is two server-owned columns on the parent row:

| Collection | Field | Type | Directus meta [SCHEMA] |
|---|---|---|---|
| `events` | `translations` | `json`, nullable, default null | readonly; note: *"Auto-generated translations: { name: { en, es, original_lang }, description: { en, es, original_lang }, promoText: { en, es, original_lang } }"* |
| `events` | `translation_status` | `string`, nullable, default null | readonly; choices `pending`, `done`, `failed`; note: *"Status of the automated translation job"* |
| `providers` | `translations` | `json`, nullable | readonly; note: *"Auto-generated translations: { description: { en, es, original_lang } }"* |
| `providers` | `translation_status` | `string`, nullable | readonly; choices `pending`, `done`, `failed` |

Canonical TS types [SRC `event.interface.ts`, `provider.interface.ts`]:

```ts
interface EventTranslationField { en: string; es: string; original_lang: string; }
interface EventTranslations   { name?: EventTranslationField|null; description?: …; promoText?: … }
interface ProviderTranslations { description?: EventTranslationField|null }
translation_status?: 'pending' | 'done' | 'failed' | null;
```

Observed row shape [DATA, event `e7fe28f8-…`]:
`{ name: { original_lang: "en", en: <str>, es: <str> }, description: { original_lang: "en", en: <str>, es: <str> } }`
`promoText` key present on 19/19 translated events that have a non-empty `promoText` [DATA].

"English and Spanish translation entries" in the database = the `en` / `es` keys inside this JSON. There is no `languages` collection / `languages_code` relation [SRC: zero references].

---

## C. Where translation runs / trigger path

1. **Canonical client never writes `translations` or `translation_status`.** Every `createItem`/`updateItem` on `events`/`providers` was inspected (`event.service.ts` 451/472/489-490/500/522/526/530/561, `directus.service.ts` 475, `provider.service.ts` 43/64/90) — none include them. [SRC]
2. **Canonical client never calls a translation endpoint.** The 28 `environment.*_FLOW`/config keys referenced by the app contain no translation flow; no Google Translate URL/SDK; no `fetch` to a translation service. [SRC]
3. Therefore translation is **server-side, triggered by Directus item create/update** — i.e. a Directus **Flow (event hook)** or a **server extension hook** (options B or D). Not A (client) and not C (no custom endpoint is called by the client). [SRC + DATA]
4. Timing evidence: typical translated events show `date_updated − date_created` ≈ **5–11 s** → asynchronous action hook writing back after create. [DATA]
5. **Which of B vs D, the exact event scope (create / update / which fields), filters, and Google client config are [UNPROVEN]**: `/flows`, `/operations`, `/extensions` return `403 FORBIDDEN` anonymously (correctly). Requires Kristen/admin to export the definition read-only.

### Credentials
- Ownership is **backend-only** (no key, env var, or SDK in canonical client). Variable names are not visible from client source. [SRC]
- **Portal needs no new secret.** No translation key must ever appear in Angular source.

---

## D. Event translation workflow (canonical)

1. User submits create-event wizard → `createEventWithImages` / `saveEventWithImages` → `createItem('events', payload)` (payload has no translation fields) [SRC]
2. Upload images → `updateItem('events', id, { images: { create… } })` [SRC]
3. Server hook detects source language, writes `translations` JSON + `translation_status: 'done'` (≈ seconds later) [DATA; mechanism UNPROVEN]
4. Reads use `fields: ['*.*' …]` / `'*'` so `translations` is returned automatically [SRC `event.service.ts`]
5. Consumer UI renders via `UtilService.localizeEventText()` / `EventInfoComponent.localizedEvent` [SRC]

- Translation does **not** depend on client step ordering — the client does nothing translation-related. [SRC]
- **Drafts are translated too**: 14 draft events have translations (vs 86 published, 55 archived). Not publish-gated. [DATA]
- Untranslated **published** events: only **2** in the whole DB (`21ee8a4d-…` created 2026-10-04, `28283403-…` created 2026-10-02), both `translation_status = null` (never even `pending`). Timing is consistent with recent portal-created events, but the creator and the **cause are [UNPROVEN]** without the Flow definition. Status `null` (not `failed`) implies the hook never ran / filtered them out, rather than failing.
- Duplicate (`duplicateEventAsDraft`) does not copy `translations` → new row is translated by the hook like any create. [SRC]

## E. Provider/business translation workflow (canonical)

- Same mechanism, **only `description`** is translated; `name` is not. [SCHEMA + DATA]
- Client: `createItem('providers', …)` at registration (`directus.service.ts:475`) and `updateProvider()` (`provider.service.ts:90`) which **always sends the full field set including `description`**. [SRC]
- Coverage: 21 providers `done`, 79 `null`. Earliest translated provider `date_updated` = **2026-09-29**; translated providers' create→update gaps are hours–days. Consistent with provider translation being introduced recently and/or triggered on **update** — **[UNPROVEN]** whether create triggers it.

---

## F. Translation data model (exact)

`events.translations` / `providers.translations`: JSON object, keys = translated source field names; value per field:
`{ original_lang: <detected ISO-639-1 code>, en: <string>, es: <string> }`.
Language identifiers are plain strings `"en"` and `"es"`. `original_lang` observed values: events `en`(64) `es`(8) `fr`(2); providers `en`, `mt`, `et` (latter two = automatic detection results on short/ambiguous text). Lifecycle: owned by the server hook, overwritten in place on the parent row; no child rows, no separate timestamps (parent `date_updated` changes).

## G. `translation_status` lifecycle

| Value | Source | Meaning | Who sets | Client may set? | Canonical UI behaviour |
|---|---|---|---|---|---|
| `null` | [SCHEMA default, DATA] | job never ran/recorded | default | No | Original text shown |
| `pending` | [SCHEMA choice] | job in progress | server hook | No (field readonly; client never writes) | Not read by UI; original shown |
| `done` | [SCHEMA, DATA] | translations written | server hook | No | Translated text shown |
| `failed` | [SCHEMA choice] | job failed | server hook | No | Not read by UI; original shown |

No row currently `pending` or `failed` [DATA]. **The canonical client never reads `translation_status`** — rendering depends only on `translations` [SRC].

## H. Source-language behaviour
Source language is **auto-detected per field** and stored in `original_lang` (proved by `fr`, `mt`, `et`, `es` values). Input is not assumed English, UI language is not used as source. Both `en` and `es` are always populated (the source language's slot holds a translation/copy). [DATA + SRC]

## I. Edit / re-translation behaviour
- Client side: canonical edit sends the full payload (event `saveEventWithImages` → `updateItem`; provider `updateProvider` full set). Client never clears/sets translation fields. [SRC]
- Whether the server re-translates on every update, only when `name/description/promoText` change, sets `pending` first, or skips: **[UNPROVEN]** — requires the Flow/extension definition. Read logic shows the original text is always shown when the viewer's language equals `original_lang`, so a stale translation is only visible to the *other*-language audience.

## J. Read / fallback behaviour (exact, [SRC] `util.service.ts:16-27`, `event-info.component.ts:101-113`)

```
t = row.translations?.[field]
if (!t)                      → original field
else if (lang === t.original_lang) → original field
else                         → t[lang] || original field
(UtilService additionally capitalises the first character)
```
Missing / pending / failed / absent → original text. No error UI. Owner-facing screens (`business-events.page.html`, create/edit wizards) show and edit the **original** fields only. Consumer screens (home, search, bookmarks, event-info, provider-info) show localized text.

## K. Fields: translated vs not

| Content | Classification |
|---|---|
| Event `name`, `description`, `promoText` | **TRANSLATED** |
| Provider `description` | **TRANSLATED** |
| Provider `name`, event address, provider address/city | NOT TRANSLATED |
| Event `category`, provider `business_type`, `offerings` | LANGUAGE-INDEPENDENT codes (labels via UI dictionary: `CATEGORIES.*`; business types render English label per canonical) |
| Phone / WhatsApp / email / URLs / social | LANGUAGE-INDEPENDENT |
| Price / currency | LANGUAGE-INDEPENDENT (formatted by pipes) |
| Areas (`areas.name`) | NOT TRANSLATED (proper names) |
| Dates / times | LANGUAGE-INDEPENDENT data; formatted with `dateLocale` in consumer views |
| Opening hours day names | UI dictionary (`DAYS.*`) |

---

## L. Portal parity matrix

| Function | Canonical VAMO | Business Portal | Parity | Required fix |
|---|---|---|---|---|
| UI language detection | ?lang→saved→device→en | same | YES | — |
| UI language persistence | `vamo_lang` | `vamo_lang` (localStorage) | YES | — |
| Login language | translated | translated | YES | — |
| Registration / onboarding language | translated | translated | YES | — |
| Language selector when logged in | Home globe + Profile tile | none in shell | NO | Add selector to topbar/sidebar (portal code) |
| Dashboard (overview) | translated | English hard-coded | NO | Externalize strings |
| Business profile page | translated | English hard-coded | NO | Externalize strings |
| Event list | translated | English hard-coded | NO | Externalize strings |
| Event editor | translated | English hard-coded | NO | Externalize strings |
| Subscription / billing | translated (`SUB.*`, `PAYMENT.*`) | English hard-coded | NO | Externalize strings |
| Customer-safe errors | partly translated | English | NO | Route through i18n |
| Date formatting | `dateLocale` (`es`) | hard-coded `en-US`; `es-DO` unused | NO | Use `dateLocale`, align `es` |
| Event translation trigger | server hook on write | same backend, but 2 recent published events never translated (null) | **UNKNOWN** | Inspect Flow (backend) before any portal change |
| Event translation records | server writes JSON | portal never writes them ✅ (`createEvent`/`updateEvent` omit them) | YES (client side) | — |
| `translation_status` | server-only | portal never writes ✅ (`protectedProviderFields` excludes for providers) | YES | — |
| Event edits / re-translation | full payload on edit | **partial diff payload** (only changed fields, trimmed) | UNKNOWN | Depends on Flow trigger conditions |
| Business profile translation | server hook, description | same backend; portal never writes fields ✅ | UNKNOWN | Verify hook fires for portal writes |
| Business profile edits | full field set every save | diff-only (`buildSafeProviderPayload(data, original)`) | UNKNOWN | Depends on Flow |
| Translated content reads | consumer views only | owner views show originals (same as canonical owner views) | YES | — (optional preview only) |
| Fallback behaviour | original text | n/a (portal shows originals) | YES | — |

## M. Existing portal defects / gaps
1. Authenticated area (shell, overview, profile, listings, editor, billing) is English-only; no in-app language selector.
2. Hard-coded `en-US` date formatting; `es-DO` vs canonical `es`.
3. Two recently created published events have `translations = null`, `translation_status = null` — root cause unproven (see N).
4. Edit payloads are diff-based whereas canonical sends full payloads — may change hook behaviour (unproven).
5. Out of translation scope but noted: portal `duplicateEventAsDraft` appends `" (Copy)"` to `name` and copies areas; canonical copies name verbatim and does not copy areas.

## N. Backend / Flow / config — information required (no changes made)
Read-only export (by Kristen / admin) of the Flow(s) or extension that write `translations`:
- trigger type (event hook action/filter vs schedule), scope (`items.create`, `items.update`), collections;
- conditions/filters (e.g. on `$accountability`, role, origin, payload keys, `status`);
- source-detection + Google call, which fields, retry/failure handling, `pending`/`failed` writes;
- re-translation rule on update (changed fields only? always?).
Then explain why `21ee8a4d-…` and `28283403-…` were skipped. **No backend change proposed until this is seen.**

## O. Portal code changes (Phase 2, pending approval)
- `src/app/layout/topbar/topbar.component.ts` (or sidebar): mount `<app-language-selector>`.
- `src/app/core/i18n/translations/{en,es}.ts`: add canonical keys (`EVENTS.*`, `SUB.*`, `PAYMENT.*`, `PROFILE_PAGE.*`, `PROVIDERS.*`, `INSIGHTS.*`, `CATEGORIES.*`, `DAYS.*`) copied verbatim from canonical JSON; `PORTAL.*` only for desktop-only text.
- Pages: `overview.component.ts`, `business-profile.component.ts`, `listings.component.ts`, `listing-editor.component.ts`, `billing.component.ts`, `shell/sidebar/topbar` → `TranslatePipe`.
- `i18n.service.ts`: `LANG_TO_LOCALE.es = 'es'`; register `es` locale data; replace `toLocaleDateString('en-US')` in `listings.component.ts:1277/1284`, `billing.component.ts:1962`, `overview.component.ts:846`.
- `customer-error.service.ts`: return i18n keys.
- Only if Flow inspection proves it necessary: align `BusinessService.updateEvent` / `updateProvider` payload semantics to canonical full-payload behaviour.
- **Never**: write `translations`/`translation_status`, call Google from Angular.

## P. Security / cost
- Google calls originate server-side only (client has no key/endpoint) [SRC]. Portal adds no secret.
- Rate limits, retries, dedupe, and whether unchanged edits re-translate (cost): [UNPROVEN] — Flow export needed.
- Duplicates create a new row → translated again (cost per duplicate) [SRC + DATA: drafts get translated].
- Drafts are translated (not publish-gated) [DATA].

## Q. Definition of 100 % parity
1. Same UI language detection/persistence/switching, selector reachable when logged in.
2. Same EN/ES strings (canonical keys verbatim; `PORTAL.*` only for portal-only UI).
3. Same date/number locale (`en-US` / `es`).
4. Portal writes events/providers such that the **same server hook** fires; portal never writes `translations`/`translation_status`.
5. Same auto-detected source language (`original_lang`) semantics.
6. Same `translation_status` lifecycle (server-owned).
7. Same edit → re-translation behaviour (as defined by the hook).
8. Same read/fallback rule wherever the portal displays consumer-facing content (e.g. previews).
9. Event (`name`, `description`, `promoText`) and provider (`description`) translated identically.
10. Zero translation secrets in browser code.

## R. Recommended Phase 2 sequence
1. Kristen/admin exports translation Flow/extension definition (read-only) → close all [UNPROVEN] items, explain the 2 untranslated events.
2. If the hook excludes portal writes: backend fix (Kristen approval) — **not** a portal workaround.
3. Portal: payload semantics alignment only if (1) proves it matters.
4. Portal: shell language selector + date locale alignment.
5. Portal: externalize authenticated-page strings using canonical keys (page by page, tests per page).
6. Verification on a staging/test record approved by Kristen (create + edit → observe `translations`/`translation_status`).
