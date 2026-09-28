# Post-Modularization A5 — Critical Browser E2E

## Status

2026-09-28: **A5-A READINESS AUDIT COMPLETE / A5-B1 MERGED + CI GREEN (#2580 / `e7477ef2` / CI #6529) / A5-B2-A MERGED + CI GREEN (#2581 / `0627931b` / CI #6533) / A5-B2-B MERGED + CI GREEN (#2582 / `c8775b1c` / CI #6535) / A5-C1 MERGED + CI GREEN (#2583 / `8226f627` / CI #6539) / A5-C2 MERGED + CI GREEN (#2584 / `f5133dde` / CI #6543) / A5-D1 MERGED + CI GREEN (#2585 / `b3552526` / CI #6545) / A5-D2 LOCAL SOURCE READY FOR REVIEW / NO MIGRATION / NO GRAPH DIRECTION CHANGE**

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

Merged implementation establishes:

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

This slice deliberately does **not** add Staff/MFA/Accounting journey assertions. It first proves the runner, disposable DB, real processes and transport path are deterministic. PR #2580 merged as `e7477ef2`; authoritative CI #6529 passed the new browser-e2e job plus the existing API/Web/printer-agent/Windows gates.

### Lockfile gate — complete

The repository requires dependency manifest and `pnpm-lock.yaml` to move together and forbids hand-editing generated lockfile sections. Because the SanQ MCP workspace has no shell/package-manager execution, the user generated the lockfile locally with repository-pinned pnpm 9.0.0 and returned it for review.

The returned lockfile was imported byte-for-byte. The Web importer retains `@playwright/test` specifier `^1.51.1` and resolves it to 1.63.0. Comparison against the current `dev` lockfile found exactly three new Playwright package headers (`@playwright/test`, `playwright`, `playwright-core`) plus the expected replacement of the existing Next, next-auth and next-pwa resolution keys so Next's optional Playwright peer is bound. No unrelated package-header additions or removals were found.

The dependency/lockfile gate is therefore satisfied and was validated in the merged B1 CI.

### A5-B2 — Staff / Accounting / MFA journeys

B2 is split so stable identity/routing coverage does not depend on the OTP harness.

#### A5-B2-A — Staff identity / routing / Accounting / logout

Merged B2-A source adds real Chromium journeys for:

- ADMIN password login -> canonical Admin surface with the signed browser session intact;
- ACCOUNTANT password login -> `/accounting/dashboard`;
- `/accounting` -> canonical `/accounting/dashboard`;
- ACCOUNTANT denied Admin entry -> canonical Accounting landing;
- unauthenticated STAFF/POS entry -> unified Staff login with `next=/store/pos`; the login page derives the POS device-binding UI from that target without needing the separate `needDevice=1` hint;
- STAFF password submission for the POS target without device credentials -> HTTP 403, no `session_id`, and continued stay at the device-admission boundary;
- Admin UI sign-out -> server-side session revocation, session-cookie removal and return to unified Staff login.

B2-A deliberately does **not** claim POS admission or an authenticated STAFF session. `/store/pos` requires the existing `posDeviceId` + `posDeviceKey` credentials before a `purpose=pos` password login can create the Staff session. Device claim, admitted STAFF session, and authenticated STAFF denial from Admin/Accounting therefore remain A5-D. PR #2581 merged as `0627931b`; authoritative CI #6533 passed all API/Web/browser/printer/Windows gates after CI #6531/#6532 corrected two test assumptions and locked the actual fail-closed middleware/login contract.

#### A5-B2-B — Admin action-MFA

B2-B readiness audit confirms the action-MFA journey can use only existing production contracts plus the established disposable CI boundary. Ordinary Admin GET browsing remains allowed with `mfaVerifiedAt = null`. The Member Management Loyalty rules save is selected as the deterministic protected action: its PATCH is guarded by `AdminMfaGuard`, so the pre-MFA attempt must stop at 401 before the writer executes; after verification, resubmitting the unchanged currently loaded policy is a bounded disposable-DB write with no external side effect.

Current local B2-B source adds:

- deterministic E2E BrandConfig and LoyaltyProgramPolicy singleton fixtures required by the existing Messaging/Loyalty paths;
- `STORE_ID=e2e_store` for the browser API runtime so canonical Brand/Store reads target the disposable store;
- a Browser-E2E-only `SANQ_E2E_API_LOG` path pointing at the already existing `${RUNNER_TEMP}/sanq-api.log` file;
- a Chromium journey that logs in as ADMIN, proves `mfaVerifiedAt = null` / `requiresTwoFactor = true`, loads `/admin/members`, attempts `Save rules`, requires the protected PATCH to return 401 and the shared API client to redirect to `/admin/2fa`, requests the real email challenge, reads the six-digit code emitted by the existing LogEmailProvider from only the newly appended ephemeral log text, submits `/auth/2fa/email/verify`, proves the same session now has `mfaVerifiedAt` and no longer requires MFA, then returns to Member Management and requires the same Loyalty policy PATCH to succeed.

No test-only HTTP route, deterministic production OTP generator, Auth guard bypass, provider mock endpoint, real email/SMS provider or production persistence contract is added. The MFA browser test disables its own automatic retry because the real OTP send cooldown makes a retry semantically different; all assertions remain strict.

The earlier "session refresh" wording is narrowed to session continuity/expiry/logout for B2. The only current active keepalive implementation is POS-specific `PosSessionKeepAlive`, so renewal/resilience belongs to A5-D rather than creating a new generic Staff refresh contract.

### A5-C — Customer / benefits / controlled checkout

A5-C is split to keep identity/benefit coverage independent from state-mutating checkout coverage.

#### A5-C1 — Customer identity + benefits read

C1 is merged through PR #2583 / `8226f627`; authoritative CI #6539 is green. It adds deterministic disposable fixtures for one CUSTOMER with a verified Canadian phone, Silver LoyaltyAccount (10 points / $20 stored balance), one active $1 Coupon, and membership-login AuthChallenge data whose code hash is derived from the CI-only `OTP_SECRET`. The challenge is fixture data only; no production OTP generator or verification rule changes. CI #6537 calibrated the fixture to the real digits-only persisted phone normalization and actual `+1 416...` display shape; CI #6538 exposed only a strict-locator collision between two legitimate `$20.00` balance displays and was fixed by scoping the UI assertion. The final business path is unchanged.

Browser coverage is intentionally two-part. The membership login UI proves `Send code` reaches the real `/auth/login/phone/request` path and LogSmsProvider without scraping/exporting the generated OTP. A deterministic session journey consumes a seeded challenge through the unchanged `/auth/login/phone/verify` endpoint, receives the normal signed `session_id`, enters Member Center, and proves the canonical Membership summary/coupon contracts expose CUSTOMER identity, Silver tier, 10 points, $20 balance, $10 redeemable value and the active E2E coupon. Because OTP send cooldown and challenge consumption are one-shot semantics, this C1 describe block disables automatic retry rather than weakening assertions.

#### A5-C2 — Benefit application + controlled checkout

C2 merged through PR #2584 / `f5133dde`; authoritative CI #6543 is green. It uses the same deterministic Menu shape but gives the state-mutating checkout journey its own disposable CUSTOMER, LoyaltyAccount, active $1 Coupon and pending membership-login AuthChallenge. This prevents C2's real points/balance/coupon mutations from making C1 execution-order dependent while both journeys still consume the unchanged verification endpoint without fabricating session cookies. Chromium seeds the real persistent cart with the $5 E2E item, opens the production checkout UI, applies the $1 member Coupon and 1 point, and requires the canonical `/orders/pricing/quote` request to carry the authenticated `userStableId`, `couponStableId`, `redeemValueCents=100` and menu item. The server response is locked to 500c subtotal / 100c coupon / 100c points / 39c tax / 339c total. CI #6541 found only two Prettier formatting violations in the seed; CI #6542 then exposed the browser runtime's missing CI-local `CLOVER_PRICING_TOKEN_SECRET`, which is required because PricingTokenService signs before the zero-external short-circuit. Adding that non-provider test secret closed the runtime gap without changing production Clover behavior.

The same journey enters $3.39 stored balance, requires the UI's remaining external amount to become $0.00, and clicks the ordinary balance-payment action. The existing `/clover/pay/online/session` transport must return `externalPaymentCents=0` plus `completedOrderStableId`; the browser must navigate directly to `/thank-you/<orderStableId>` rather than any `/wallet/*` route. An authenticated read of that Order must prove `paid`, `STORE_BALANCE`, the same 500/100/100/39/339 pricing facts, 339c balance paid and zero external paid. This is evidence of the existing zero-external controller branch, which returns before `CheckoutIntent` persistence / Clover external-charge handling. Real Clover charges, Apple Pay and Google Pay remain forbidden in browser CI.

### A5-D — POS / Print / Display / PWA

A5-D is split to keep device identity, durable print handoff and browser-local display/PWA behavior independently attributable.

#### A5-D1 — POS device claim + Staff admission

D1 merged through PR #2585 / `b3552526`; authoritative CI #6545 is green. It reuses the ACTIVE seeded POS device and existing `SANQ_E2E_POS_ENROLLMENT_CODE`; no new database fixture was required. Chromium starts at `/store/pos`, follows the real middleware redirect to unified Staff login, enters the one-time enrollment code, and requires `/pos/devices/claim` to succeed. The production claim contract rotates the device key, writes httpOnly `posDeviceId` + `posDeviceKey`, and invalidates the enrollment code. The journey then performs the real STAFF password login with `purpose=pos`, requires admission to `/store/pos`, checks the ordinary signed `session_id` alongside both device cookies, and proves `/auth/me` returns STAFF while guarded `/pos/store-context` resolves `e2e_store / SanQ E2E Store / America/Toronto` from the authenticated device owner.

The test disables automatic retry because enrollment claim is intentionally one-time. There is no direct cookie fabrication, device-guard bypass, seeded plaintext device key, Auth/POS source change or provider call.

#### A5-D2 — Controlled order acceptance -> durable PrintJob

Current local D2 source uses a separate ACTIVE POS device with its own CI-only enrollment code plus one deterministic `paid / web / IMMEDIATE` Order and one ordinary E2E OrderItem. This keeps D1's one-time device rotation and D2's state-mutating order lifecycle fully independent. Chromium claims the D2 device and creates a real STAFF `purpose=pos` session, but deliberately does not mount the full POS board UI because the seeded StoreConfig has `autoAcceptOnlineOrders=true`; avoiding that effect removes a race without changing production auto-accept behavior.

With the same browser credentials, D2 calls the existing guarded `/pos/orders/board` contract and requires the seeded Web order to be visible as `paid`. It then POSTs `/pos/orders/:orderStableId/advance`, the exact canonical transport used by the board Accept action. `PosOrdersService.advance()` calls Orders-owned `acceptWebOrder()`, which records `order.accepted`, eagerly materializes immediate preparation to `making`, and wakes the API-process `OrderLifecycleOutboxProcessor`. The durable consumer turns `order.prep_started` into Print-owned `ORDER_PRINT_HANDOFF_REQUESTED`; `PosGateway.enqueuePrintHandoff()` upserts the durable `PosPrintJob(kind=AUTO)` before transport dispatch.

D2 polls the already-existing guarded `/pos/orders/:orderStableId/print-status` transport until that AUTO job is visible. Browser CI intentionally has no physical printer/socket client, so customer and kitchen targets must remain `PENDING` with `CLIENT_OFFLINE`; that is successful evidence of durable persistence plus deferred transport, not a print failure. The test finally re-reads the Order as `making`. No direct Prisma read, OpsEvent diagnostic route or physical printer ACK is introduced.

#### A5-D3 — POS/Customer Display/PWA reload

Then cover the existing same-browser-profile POS display snapshot projection, POS PWA route launch/reload and the bounded reload/session continuity that is actually browser-observable. Physical printer output, real Clover hardware, Windows fullscreen/window recovery and real service-worker update/cache recovery remain separate operational evidence where Chromium CI cannot faithfully reproduce the workstation environment.

## Architecture effect

A5-B1 adds a **test/CI dependency only** and a disposable CI database/runtime. A5-B2-A adds browser assertions only and consumes the existing Staff/Auth, Accounting and POS device-admission contracts. A5-B2-B adds deterministic disposable fixtures, a CI-local log observation path, and browser assertions around the existing action-MFA contract. A5-C1 adds only disposable Customer/Loyalty/Coupon/AuthChallenge fixtures plus browser assertions against existing Identity/Membership contracts. A5-C2 adds an isolated disposable checkout Customer/Loyalty/Coupon/challenge fixture set plus browser assertions across existing Cart, Orders pricing, Benefits and zero-external Web checkout contracts; it does not change the production payment path. A5-D1 adds browser assertions only around the existing POS device claim, device cookies, STAFF `purpose=pos` session and guarded store-context contracts. A5-D2 adds isolated disposable POS-device/Web-order fixtures plus browser assertions across existing guarded POS board/advance/print-status transports and existing Orders -> Print durable lifecycle ownership. None of these slices introduces a new production bounded context, context direction, scanner allowance, SCC, public HTTP contract, persistence model/schema/migration, payment/provider runtime, authentication authority, POS device authority, Order ownership, Print ownership or Customer Display ownership.
