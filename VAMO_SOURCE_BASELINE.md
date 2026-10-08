# VAMO Source Parity Baseline Audit: October 7, 2026

**Repository**: `weiskristen-hash/vamo-business-portal`  
**Reference Source**: `Isla-Labs-DR/vamo-app` (strictly read-only)  
**Audited Head SHA**: `f5a9bca47d39bd5adc34c4ff8e9090e34e48b0b1`  
**Prior Baseline SHA**: `e90f727e233c36b1e84961604ad3fd0fe2cd6681`  
**Feature Branch**: `fix/source-parity-october-7`

---

## 1. Source Scope & Commits Audited

Between `e90f727e` and `f5a9bca`, 10 commits and 28 changed files were evaluated in the canonical source:

1. `0dcf1ac` - Translate plan names everywhere, describe boost options in web checkout
2. `b2e33f3` - Profile: restyle support/legal links as grouped card with icons
3. `38c7b1d` - Web: drop Cloudflare Pages' auto-generated Link preload header
4. `099ffe3` - Show Sign in with Apple on iOS only
5. `f3aebbf` - Share: fall back to copying the link on web when the share sheet is unavailable
6. `8adad6c` - Business profile: keep email and phone required, only WhatsApp is optional
7. `acb495c` - Promote Post: go straight to the boost checkout from edit mode and event details
8. `276c96f` - Ask guests to log in or sign up before saving favorites
9. `9be225c` - Return guests to the event or provider they favorited after login or sign-up
10. `f5a9bca` - Android: add events to the calendar via the calendar app instead of a permission that was never declared

---

## 2. Parity Implementations in Business Portal

### A. Required Business Email & Phone (`8adad6c`)
- **Profile Parity**: In `business-profile.component.ts`, business email and phone must remain populated and valid.
- **Validation Bypass Removed**: Removed legacy `initialValue` validation bypass that previously allowed invalid existing phone numbers to be resubmitted.
- **Required Indicators & Localized Feedback**:
  - Added required asterisks (`*`) to both Phone and Email field labels.
  - Added dedicated translated error messages for empty states: `PORTAL.PROFILE.PHONE_REQUIRED` and `PORTAL.PROFILE.EMAIL_REQUIRED` in both English (`en.ts`) and Spanish (`es.ts`).
  - Preserved format validation for invalid formats (`PHONE_INVALID`, `EMAIL_INVALID`).
- **Optional WhatsApp**: WhatsApp number remains optional (`wa_number`), but if entered it must strictly validate as a phone number before saving.
- **Save Protection**: `saveProfile()` immediately marks fields touched, displays validation error banner, and halts before ever invoking `businessService.updateProvider()`.
- **Onboarding Alignment**: Verified `onboarding.component.ts` already enforces valid phone/email and optional WhatsApp.

### B. Consistent Plan Name Translations (`0dcf1ac`)
- **StripeService Helpers**:
  - Reused `tierFromProductName` in `stripe.service.ts` to implement:
    - `planTitleKey(productName: string | null | undefined): string`
    - `getPlanTitle(productName: string | null | undefined): string`
  - Utilizes existing canonical keys: `PAYMENT.PLANS.STARTER.TITLE`, `PAYMENT.PLANS.BASIC.TITLE`, and `PAYMENT.PLANS.ADVANCED.TITLE`.
  - Unknown plan names pass through unchanged without modification.
  - Empty string `''` returned for null, undefined, or empty inputs.
  - Unknown plan names are **never** defaulted to Starter.
- **Billing Page Integration**:
  - Current-plan badge, pending-downgrade banner, plan cards, modal titles, and checkout subtitle format display titles through `getPlanTitle()`.
  - Added reactive signal and effect in `billing.component.ts` so live language switches (EN ↔ ES) immediately refresh success banners and plan titles.
  - Preserved Stripe price IDs (`price_*`), stored product names in state, comparison logic, and currency amounts intact.

### C. Editor Promotion Shortcut (`acb495c`)
- **Eligibility**: Added `canPromotePost` getter in `listing-editor.component.ts`:
  - Eligible only when: `isEditMode && !isDraft && !isPastEvent && !!eventId`.
  - Ineligible in create mode, draft listings, past events, or missing IDs.
- **Editor CTAs**: Added "Promote Post" (`PORTAL.EVENT_EDITOR.PROMOTE_POST_BTN`) button to both the top header actions and the bottom actions bar.
- **Clean Routing**: When form has no unsaved changes, routes immediately to `/app/promotions?eventId=<id>`. Placements are not preselected and no purchase is executed automatically.
- **Dirty State Protection**: If the editor has unsaved changes, clicking Promote Post opens the discard confirmation modal (`pendingExitTarget = 'promotions'`), preserving user edits unless discarded.
- **Return Navigation on Promotions Page**:
  - Added breadcrumb return link in `.page-header` to `/app/listings`.
  - Added return link in checkout actions when not actively in payment.
  - Added return button in the order success alert banner.

---

## 3. Preserved Rules & Boundaries
- `Isla-Labs-DR/vamo-app` remained strictly read-only throughout (no edits, pushes, or PRs).
- PR #37 business-only registration and Google SSO flow preserved intact.
- Past-event editing restrictions, date locks, and scheduling protections remain active.
- All network and Directus API requests in tests are mocked; zero production data modifications.

---

## 4. Test Verification Summary
- **Total Test Suites**: 31 / 31 passed (100%)
- **Total Tests**: 616 / 616 passed (100%)
- **Production Build**: `ng build` succeeded with zero TypeScript or bundling errors.
