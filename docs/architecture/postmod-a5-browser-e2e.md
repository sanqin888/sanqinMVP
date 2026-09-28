# Post-Modularization A5 — Critical Browser E2E

## Status

2026-09-28: **A5-A READINESS AUDIT COMPLETE / A5-B1 LOCAL SOURCE READY FOR REVIEW / USER-GENERATED PNPM LOCKFILE IMPORTED + REVIEWED / NOT PUSHED / NO PR / NO MIGRATION / NO GRAPH DIRECTION CHANGE**

Audit baseline: `origin/dev@74b8fb19` after A4-D store-installation closeout.  
Owner: **Quality gate / Web browser integration**, consuming existing Identity, Store Operations/POS, Orders, Benefits, Accounting and Print contracts without taking ownership of them.

A5 is intentionally a small critical-journey regression layer, not a replacement for existing API/Web unit and architecture tests and not a physical-device acceptance suite.

## A5-A readiness audit

### Existing test/runtime baseline

Before A5 there is no configured browser E2E runtime in the repository:

- Web uses Jest with Node test environment; there is no `test:e2e` script or Playwright/Cypress project.
- API Nest/Supertest coverage is process-local and does not exercise a real browser, Web BFF, signed browser cookies, a separately running API process and PostgreSQL together.
- Existing CI runs API and Web build/lint/type/test independently but does not provision a disposable PostgreSQL service or launch a complete Web + API browser stack.

The audit therefore classifies A5 as **READY FOR IMPLEMENTATION**, but requiring a new browser-test dependency and CI orchestration rather than a business-architecture redesign.

### Existing boundaries that are already browser-testable

The current production contracts are suitable for direct browser verification:

- **Staff authentication / role landing:** `/staff/login` already drives the canonical password login, signed session cookie and role-specific routing.
- **Accounting direct launch:** the A2 `/accounting` stale-entry redirect and `/accounting/dashboard` canonical launch can be verified directly.
- **Admin action MFA:** the existing session/MFA contracts can be exercised with deterministic disposable-database challenges; no provider-specific test endpoint is required.
- **POS device binding:** `/pos/devices/claim` already owns device enrollment and returns the same signed `posDeviceId` / `posDeviceKey` cookies used by production POS admission.
- **Customer/member benefits:** Customer, LoyaltyAccount, Coupon/UserCoupon and public menu facts can be deterministic disposable fixtures.
- **Safe checkout success path:** Web checkout is server-authoritative. When stored balance covers the complete tender, `/clover/pay/online/session` resolves `externalCents=0` and calls `createImmediatePaid()` without entering an external Clover charge.
- **Durable Print handoff:** accepted/preparation lifecycle facts create a Print-owned `PosPrintJob`. In browser CI, where no physical printer-agent is connected, the job can safely remain durable as `PENDING / CLIENT_OFFLINE`; this is useful evidence rather than a test failure.
- **POS -> Customer Display:** the display remains a read-only browser-local projection using localStorage, BroadcastChannel and its polling fallback. Two pages in one Playwright BrowserContext can verify the real same-profile contract.
- **PWA behavior:** the meaningful PWA path must use a production Web build because `next-pwa` is disabled only for development mode.

### External/provider boundary

Browser CI must never call real payment or messaging providers merely to obtain coverage.

Current source already provides the needed safe boundary:

- `SMS_PROVIDER=log` selects `LogSmsProvider`;
- `EMAIL_PROVIDER=log` selects `LogEmailProvider`;
- Google OAuth can be bootstrapped with non-production dummy client configuration and is not called by the A5 foundation;
- Clover real charges, Clover Terminal, Uber provider traffic, physical printer ACKs and Windows multi-monitor/fullscreen behavior remain outside browser CI.

Physical workstation/device acceptance remains under A4 operational verification.

## Implementation sequence

### A5-B1 — Browser E2E foundation

Current local implementation establishes:

1. `@playwright/test` as a Web dev dependency and `pnpm --filter web test:e2e`.
2. Chromium-only Playwright configuration with one worker, CI retries, trace/screenshot/video retention on failure and HTML diagnostics.
3. A fail-closed deterministic seed:
   - requires `SANQ_E2E=1`;
   - requires `NODE_ENV=test`;
   - accepts only `localhost` / `127.0.0.1`;
   - requires database name exactly `sanq_e2e`;
   - seeds an active Store/StoreConfig, all-week business hours, one public Menu fixture, ADMIN/ACCOUNTANT/STAFF identities and one POS device enrollment fixture.
4. A dedicated GitHub Actions `browser-e2e` job:
   - PostgreSQL 15 disposable service;
   - committed migration replay with `prisma migrate deploy`;
   - deterministic fixture seed;
   - separately built/started API;
   - production Next build/start with the normal Web BFF pointed at that API;
   - log-only messaging providers and dummy Google OAuth bootstrap values;
   - Playwright Chromium installation;
   - browser diagnostics upload on failure.
5. Two foundation assertions:
   - browser request -> Web BFF -> real API health;
   - browser request -> Web BFF -> API -> PostgreSQL returns the seeded public-menu fact.

This slice deliberately does **not** add Staff/MFA/Accounting journey assertions yet. It first proves the runner, disposable DB, real processes and transport path are deterministic.

### Lockfile gate — complete

The repository requires dependency manifest and `pnpm-lock.yaml` to move together and forbids hand-editing generated lockfile sections. Because the SanQ MCP workspace has no shell/package-manager execution, the user generated the lockfile locally with repository-pinned pnpm 9.0.0 and returned it for review.

The returned lockfile was imported byte-for-byte. The Web importer retains `@playwright/test` specifier `^1.51.1` and resolves it to 1.63.0. Comparison against the current `dev` lockfile found exactly three new Playwright package headers (`@playwright/test`, `playwright`, `playwright-core`) plus the expected replacement of the existing Next, next-auth and next-pwa resolution keys so Next's optional Playwright peer is bound. No unrelated package-header additions or removals were found.

The dependency/lockfile gate is therefore satisfied. Remote delivery remains blocked only by the normal user source-review gate.

### A5-B2 — Staff / Accounting / MFA journeys

After B1 is CI-green:

- ADMIN / ACCOUNTANT / STAFF staff-login role landing;
- denied cross-surface entry;
- Accounting stale/root launch -> canonical dashboard;
- Admin action-MFA browser flow;
- session refresh/logout behavior.

### A5-C — Customer / benefits / controlled checkout

Add deterministic Customer/Loyalty/Coupon fixtures and cover:

- member login/session;
- points/balance/coupon read/application;
- menu/cart/quote;
- stored-balance full tender;
- server-authoritative paid Order creation with `externalCents=0`;
- explicit assertion that no external Clover charge path is required.

### A5-D — POS / Print / Display / PWA

Then cover:

- POS device claim + Staff POS admission;
- acceptance of a controlled Web order;
- durable PrintJob handoff;
- POS/Customer Display same-profile projection;
- production PWA launch/reload/service-worker behavior.

Physical printer output, real Clover hardware and Windows display/fullscreen remain separate operational evidence.

## Architecture effect

A5-B1 adds a **test/CI dependency only** and a disposable CI database/runtime. It does not introduce a new production bounded context, context direction, scanner allowance, SCC, public HTTP contract, persistence model, Prisma schema/migration, payment/provider runtime, authentication authority, POS device authority, Order ownership, Print ownership or Customer Display ownership.
