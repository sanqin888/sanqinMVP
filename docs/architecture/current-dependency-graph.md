# Current 12-context dependency graph

Baseline: `origin/dev@dfdf7a36` (2026-08-30).

This is the pre-modularization baseline generated from production TypeScript import
statements. Test files and the API composition root are excluded. Imports through
`public-api`, `contracts`, `ports`, `@shared/menu`, or `@shared/order` are
shown as public-contract traffic and do not consume the legacy direct-import
allowance.

## Context map

| # | Context | Current paths |
|---:|---|---|
| 1 | architecture-foundation | `apps/api/src/common` |
| 2 | brand-store | `homepage`, `location`, `store` |
| 3 | catalog-pricing-offers | `application/menu`, `coupons`, `menu`, `promotions`, `libs/shared` |
| 4 | identity-customer-benefits | `admin`, `auth`, `loyalty`, `membership`, `phone-verification` |
| 5 | commerce-orders-fulfillment | `deliveries`, `orders`, `libs/order` |
| 6 | payments-clover | `clover`, `orchestration`, `payments` |
| 7 | store-operations-pos-print | `pos`, `tools/printer-server` |
| 8 | external-channels | `integrations` |
| 9 | messaging-notifications | `email`, `messaging`, `notifications`, `sms` |
| 10 | accounting-reporting-analytics | `accounting`, `analytics`, `reports` |
| 11 | web-pwa | `apps/web/src` |
| 12 | runtime-data-ci-ops | Prisma, data retention, CI, ops and architecture tooling |

## Current edges

Counts are production import-statement occurrences. A `+N public` suffix means
those imports already use an approved public surface.

| Source | Targets |
|---|---|
| architecture-foundation | catalog-pricing-offers 1 |
| brand-store | accounting-reporting-analytics 2; architecture-foundation 2; runtime-data-ci-ops 4; store-operations-pos-print 1 |
| catalog-pricing-offers | architecture-foundation 4; identity-customer-benefits 3; messaging-notifications 2; runtime-data-ci-ops 10 |
| identity-customer-benefits | architecture-foundation 17; brand-store 4; catalog-pricing-offers 10; commerce-orders-fulfillment 1; external-channels 2 + 2 public; messaging-notifications 24; runtime-data-ci-ops 28; store-operations-pos-print 4 |
| commerce-orders-fulfillment | architecture-foundation 12; brand-store 2; catalog-pricing-offers 5; identity-customer-benefits 11; messaging-notifications 9; runtime-data-ci-ops 14; store-operations-pos-print 6 |
| payments-clover | architecture-foundation 16; commerce-orders-fulfillment 10; identity-customer-benefits 17; messaging-notifications 3; runtime-data-ci-ops 8; store-operations-pos-print 11 |
| store-operations-pos-print | architecture-foundation 9; brand-store 2; commerce-orders-fulfillment 10; external-channels 1 + 3 public; identity-customer-benefits 14; runtime-data-ci-ops 10 |
| external-channels | architecture-foundation 12; commerce-orders-fulfillment 5; identity-customer-benefits 6; messaging-notifications 2; runtime-data-ci-ops 24 |
| messaging-notifications | architecture-foundation 5; runtime-data-ci-ops 11; store-operations-pos-print 1 |
| accounting-reporting-analytics | architecture-foundation 3; commerce-orders-fulfillment 1; external-channels 1 + 2 public; identity-customer-benefits 11; runtime-data-ci-ops 9 |
| web-pwa | catalog-pricing-offers 15 public; commerce-orders-fulfillment 6 public |
| runtime-data-ci-ops | No business dependency is counted; composition-root wiring is excluded |

## Reading the baseline

- This graph records debt; it does not declare the current direction desirable.
- The graph is cyclic. Examples include Orders/POS, Store/POS, and
  Identity/Messaging. Removing those cycles is later modularization work.
- CI rejects a new direct context pair and rejects any increase above the recorded
  count for an existing direct pair.
- A new cross-context import must target the owning context's `public-api`,
  `contracts`, or `ports` surface. Reducing a baseline count is always safe; the
  allowance should be lowered in the same PR so debt cannot return.
- UberEats and Payments/Clover paths remain frozen except for non-behavioral
  guardrails and externally required fixes.
