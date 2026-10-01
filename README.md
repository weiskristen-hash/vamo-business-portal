# VAMO Business Portal

A standalone, desktop-first business portal web application for **VAMO** partners and tourism operators across the Dominican Republic.

Built with Angular 21 (standalone components, zoneless change detection) and integrated directly with VAMO Directus Cloud API (`https://api.vamo-app.com`).

---

## Architecture Overview

- **Framework**: Angular 21 Standalone Application (Web-only, zero Ionic/Capacitor runtime dependencies)
- **State & Change Detection**: Modern Angular Zoneless change detection + RxJS
- **Backend SDK**: `@directus/sdk` (`rest` and `authentication('json')`)
- **Authentication**: Email/password authentication, HTML5 localStorage session adapter (`browser-auth.storage.ts`), proactive token refresh timer, single-lock token refresh against concurrent 401s, auto-retry on `TOKEN_EXPIRED`
- **Business Guarding**: Automatic account gating (`business.guard.ts`) verifying `provider_link` attachment on `directus_users`. Accounts lacking a provider link are routed to `/no-business`
- **Design System**: VAMO SaaS palette (`#0d0d1e` dark base, `#fe397f` energetic pink accent, `#16162e` card glass, 1px subtle borders, responsive breakpoints)

---

## Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── config/             # Runtime config & Directus API host resolution
│   │   ├── directus/           # Browser auth storage & Directus SDK instance
│   │   ├── guards/             # authGuard, noAuthGuard, businessGuard
│   │   ├── models/             # VamoUser, Provider, DirectusFile, VamoEvent
│   │   └── services/           # AuthService, BusinessService
│   ├── layout/
│   │   ├── shell/              # Desktop sidebar + Topbar + Mobile drawer shell
│   │   ├── sidebar/            # Navigation sidebar with brand & profile info
│   │   └── topbar/             # Sticky header with breadcrumbs & business pill
│   ├── pages/
│   │   ├── auth/               # Login page & SSO callback handler
│   │   ├── no-business/        # Non-business account gate notification
│   │   ├── overview/           # Dashboard with live stats & recent events
│   │   └── placeholder/        # Phase 1B placeholders (Manage, Grow, Account)
│   ├── app.routes.ts           # Central router with route guarding
│   └── app.ts                  # Root application component
├── environments/               # Environment configs (development & production)
└── styles.css                  # Global VAMO design system & CSS variables
```

---

## Development

### Prerequisites
- Node.js LTS (v20+ or v24+)
- npm v10+

### Setup & Running
```bash
# Install dependencies
npm install

# Start local development server
npm start
# App available at http://localhost:4200/
```

### Running Unit Tests
Unit tests are powered by [Vitest](https://vitest.dev/):
```bash
npm test
```
All 32 unit tests across 7 test suites verify:
- Authentication state restoration, login, logout, and token refresh
- Route guard enforcement (`authGuard`, `noAuthGuard`, `businessGuard`)
- Business service provider queries and metric calculations
- Overview dashboard data rendering, loading states, and error retries
- Application shell desktop layout and mobile drawer interactions

### Building for Production
```bash
npm run build
```
Compiled production bundles are output to `dist/vamo-business-portal/browser`.

---

## Security & Deployment Boundaries
- **STRICTLY READ-ONLY Reference Application**: Isla-Labs-DR/vamo-app is reference only.
- **Zero Schema Mutations**: No Directus schema or collection alterations.
- **Zero Production Deploys**: Local and feature branch development only. All production releases require Kristen's explicit approval.

---

## Deployment (Cloudflare Workers Builds)

The portal deploys to Cloudflare Workers Builds as a static asset application serving `business.vamo-app.com`.

### Cloudflare Build Settings

In Cloudflare Dashboard > Workers & Pages > Builds:
- **Production branch**: `main`
- **Build command**: `npm run build`
- **Deploy command**: `npm run deploy`
- **Root directory**: `/`

### Architecture & Routing Notes

- **Wrangler Configuration**: Defined in [`wrangler.jsonc`](file:///c:/Users/bryew/Downloads/business_vamo-app.com/wrangler.jsonc) at the repository root.
- **Angular Build Output**: Angular outputs the compiled browser application to `dist/vamo-business-portal/browser`.
- **SPA Fallback**: Configured via `"not_found_handling": "single-page-application"` in `wrangler.jsonc`. Requests to client routes (e.g., `/overview`, `/login`, `/no-business`) serve `index.html` seamlessly without 404s.
- **Directus API Traffic**: The portal communicates directly with `https://api.vamo-app.com` via client-side requests. No worker API proxies or route rewrites interfere with API calls.
- **Custom Domain**: `business.vamo-app.com` is configured and managed directly in Cloudflare.
- **Production Approval**: Production deployments require explicit approval from Kristen before merging or releasing.

