# Codex rules for sanqinMVP

This file applies to the entire repository. A more deeply nested `AGENTS.md`, if
one is added later, may add stricter rules for its subtree but must not weaken
the safety, architecture, validation, or delivery rules in this file.

## 1. Core principles

* Make the smallest correct change needed for the task.
* Preserve existing behavior unless the task explicitly requires changing it.
* Fix root causes rather than hiding errors or weakening validation.
* GitHub Actions is the authoritative validation standard for this repository.
* Before editing code, inspect the relevant files under `.github/workflows/**` so the implementation is compatible with the actual CI gates.
* The default MCP workspace phase ends after implementation and diff/status review. Do not run local lint, build, test, or CI-reproduction commands before the user reviews the change unless the user explicitly asks for a local validation command.
* After the user approves the change for remote delivery, GitHub Actions is the validation gate. If these instructions conflict with the actual GitHub workflow, follow the workflow for validation while continuing to respect the safety constraints below.

---

## 2. Dependencies

Prefer the repository's existing dependencies and platform APIs. Do not add a
package for behavior that is already implemented safely in the workspace or can
be expressed clearly with the current stack.

When the requested change genuinely requires adding, removing, or changing a dependency version, stop before editing any dependency manifest or lockfile. Explain why the dependency change is required, its impact, and reasonable alternatives, and obtain explicit user authorization.

After authorization:

* make the smallest compatible addition or version change;
* use the repository package manager (`pnpm`) and the correct workspace filter;
* update the owning manifest and `pnpm-lock.yaml` together;
* do not hand-edit generated lockfile sections;
* do not combine unrelated upgrades, deduplication, or package-manager changes;
* inspect the final manifest and lockfile diff for unexpected transitive churn;
* report the dependency and why it was required.

Dependency manifests and lockfiles include:

```text
**/package.json
pnpm-lock.yaml
package-lock.json
yarn.lock
```

If the user explicitly requests local dependency or CI reproduction, use the
committed dependency state:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

If that explicitly requested frozen install fails because the manifest and
lockfile are inconsistent:

1. Do not bypass `--frozen-lockfile` or delete the lockfile merely to make CI
   proceed.
2. Identify the inconsistency.
3. If it was caused by the current task's intentional manifest change, regenerate
   the lockfile with the repository's pinned pnpm version and inspect the diff.
4. If it is pre-existing or unrelated, report it and do not disguise it with an
   unrelated dependency rewrite.

---

## 3. Prisma

Persisted schema changes must include a matching migration in the same change by
default. Do not leave `schema.prisma` ahead of migration history unless the user
explicitly requested a schema proposal only.

Before creating, modifying, deleting, or generating anything under
`apps/api/prisma/migrations/**`, obtain explicit user authorization. Authorization
to edit `schema.prisma` does not by itself authorize migration generation. Once
migration work is authorized, follow the rules below.

Migration files live under:

```text
apps/api/prisma/migrations/**
```

Rules:

* Create one new, descriptively named migration for the task. Never rewrite,
  reorder, squash, or delete an existing migration that may have been applied.
* Generate the migration with the repository's Prisma version against a verified
  disposable/local development database when available. `--create-only` is
  preferred so the SQL can be reviewed before application.
* If a suitable local database is unavailable, a migration SQL file may be
  created and reviewed without applying it; report that generation/application
  was not locally verified.
* Inspect generated SQL. Prisma output is not automatically safe or semantically
  complete, especially for renames, backfills, constraints, indexes, enum
  changes, and relation changes.
* Use additive expand-contract migrations for public, persisted, PWA, payment,
  printing, and accounting contracts. A rename is not a drop-and-add when data
  must be preserved.
* Backfills must be deterministic and idempotent, with pre/post counts and
  discrepancy checks appropriate to the data risk.
* Adding `NOT NULL`, tightening a constraint, changing a type, dropping a column
  or table, or otherwise risking loss requires staged migration and explicit
  user approval of the destructive/contraction step.
* Generate Prisma Client and validate the final schema after migration creation.
* Include the new migration in relevant tests and the final change report.

Allowed non-destructive commands include:

```bash
pnpm --filter api prisma:generate
pnpm --filter api exec prisma validate
```

Allowed migration-generation command, after verifying the target is a disposable
or local development database:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name <descriptive_name>
```

Never run `prisma migrate reset`, `prisma db push`, destructive SQL, or an
equivalent history-bypassing/destructive command against a database containing
valuable data.

Do not run `prisma migrate deploy` against production or otherwise mutate the
production database unless the user explicitly asks for that action and the
exact target, backup/readiness checks, and rollout plan have been verified. The
normal handoff is to generate and validate the migration locally, then report
the production deployment command as a manual action.

---

## 3.1 Database IDs and stable business IDs

Database primary keys and stable business identifiers are different identities and must not be used interchangeably.

* Prisma `id` fields backed by UUID primary keys are internal database identities unless an explicit contract says otherwise.
* Stable identifiers such as `storeStableId`, `orderStableId`, `userStableId`, `deviceStableId`, and entity-specific `stableId` fields are the preferred business identities across API, browser, WebSocket, printing, external-provider, and cross-process boundaries.
* Never infer identity semantics from a generic field name such as `storeId` or `orderId`. Inspect the Prisma relation and the owning contract. For example, `PosDevice.storeId` references internal `Store.id`, while `Order.storeId` references business `Store.storeStableId`.
* When both identities are present in one flow, variables, DTOs, ports, fixtures, and tests must use explicit names such as `storeDbId` and `storeStableId`. Do not use one ambiguous value to represent both identities.
* Internal database UUIDs must not cross an external/business boundary merely because they are available on an authenticated database record. Translate to the appropriate stable business identifier at the boundary.
* Regression tests covering identity translation must use visibly different values for database and stable IDs, for example `storeDbId = 8a3d4c0e-4750-4f6a-9138-000000000001` and `storeStableId = 4750_Yonge_Street`.

---

## 4. CI validation

GitHub Actions is the normal validation environment for repository changes.

Before editing code:

1. Inspect the relevant `.github/workflows/**` files.
2. Determine which jobs and workspaces will be affected by the intended change.
3. Implement with those CI gates in mind, but do not run local lint, build, test,
   or CI-reproduction commands during the default MCP workspace phase.

After implementation, review the final diff and workspace status, then stop and
provide the change report to the user. The user reviews the source change before
remote validation begins.

After the user authorizes remote delivery, push the feature branch, open a PR to
`dev`, and track the actual GitHub Actions run. All required CI checks must be
green before merge. Do not substitute an ad-hoc local command for a failed or
missing GitHub check.

If the user explicitly requests local validation for a particular task, use the
exact relevant commands from `.github/workflows/ci.yml` rather than simplified
equivalents, and report exactly what was run and what passed.

---

## 5. Monorepo and type safety

This is a monorepo. Changes to shared types, API contracts, schemas, generated types, shared libraries, serialization formats, configuration, or public interfaces may affect multiple workspaces.

Validate downstream consumers when relevant.

This repository uses type-aware ESLint. Successful TypeScript compilation alone does not guarantee lint success.

Do not fix type, lint, or test failures by weakening safety unless there is a specific justified reason.

Avoid shortcuts such as:

```text
as any
@ts-ignore
broad eslint-disable comments
test.skip
weakened assertions
continue-on-error
disabled validation
```

Prefer correct application-level types, interfaces, mocks, fixtures, and implementation changes.

Be especially careful with inferred external types such as Jest mocks, Prisma-generated types, SDK responses, framework callbacks, and third-party libraries.

---

## 6. Clean-environment awareness

GitHub Actions runs from a clean checkout. Local or Codex environments may contain cached or generated state that CI does not have.

Do not treat existing local state as proof that CI will pass.

Watch for differences involving:

```text
node_modules/
.next/
dist/
build/
coverage/
generated files
local .env files
local credentials
Node.js versions
pnpm versions
Linux vs macOS behavior
case-sensitive paths
```

When claiming CI-equivalent validation, prefer dependency state reproduced from the committed lockfile.

If an applicable CI step requires unavailable secrets, services, credentials, Docker infrastructure, network access, or another GitHub-only resource, do not pretend it passed.

Report it explicitly as not locally verified.

For external integrations:

* never invent credentials;
* never substitute production credentials for sandbox/test credentials;
* never weaken tests because credentials are unavailable.

---

## 7. Git and diff safety

Before completing a coding task, review the final repository state.

Run:

```bash
git status --short
```

or:

```bash
git status -sb
```

For substantial changes, also inspect:

```bash
git diff
git diff --stat
git diff --check
```

Verify that:

* only intended files were changed;
* required implementation files are not left untracked;
* no temporary/debug artifacts remain;
* no secrets or credentials were added;
* dependency changes are required by the task, minimal, and synchronized with
  the lockfile;
* each Prisma schema change has the intended new migration, existing migration
  history was not rewritten, and generated SQL was reviewed;
* unrelated user changes were not deleted or overwritten.

Do not automatically discard, reset, or delete unrelated user changes.

Validation results must correspond to the final source state that will be committed or pushed.

---

## 8. CI failure investigation

When actual GitHub CI results are available, they take precedence over assumptions based on local checks.

For a CI failure:

1. Find the first meaningful failing job and step.
2. Read the actual error.
3. Confirm the source revision GitHub tested.
4. Determine whether the cause is code, dependencies, generated files, environment differences, missing files/secrets, external services, or a flaky/pre-existing failure.
5. Fix the root cause.

Do not modify or weaken the CI workflow merely to make a failing code change appear green unless the workflow itself is genuinely incorrect.

---

## 9. Completion reporting

Do not predict CI success. Report only the stage that has actually been reached.

At the end of the MCP workspace phase, report concisely:

```text
Changed:
- <files/behavior changed>

Local validation:
- Not run by repository workflow; lint/build/test are deferred to GitHub Actions after user review.

Remote status:
- Not pushed / no PR created.
```

After the user authorizes remote delivery, report the actual PR target (`dev`),
GitHub Actions results, and merge result. Never describe a check as passed unless
that exact GitHub check completed successfully against the reviewed PR head.

If the user explicitly requested local validation as an exception, separately
report the exact commands that were run and their actual results.

---

## 10. Required workflow for repository changes

Before editing code:

1. Read this file completely and inspect any more specific `AGENTS.md` that
   applies to the target path.
2. Inspect the current implementation, its tests, the owning module's public
   boundary, relevant architecture tests/docs, and the applicable GitHub
   workflow.
3. Identify the business owner of the change and every downstream consumer of
   any contract, schema, event, shared type, or persisted field being changed.
4. Classify the work as an internal atomic change, an expand-contract data or
   public-contract migration, or a controlled integration/payment cutover as
   defined in section 18.
5. If the requested behavior requires changing an established architecture
   boundary, module responsibility, compatibility promise, or migration
   strategy, stop before editing. Explain the reason, impact, and alternatives,
   and obtain explicit user authorization.

Default delivery workflow:

1. Make the requested source changes only inside `mcp-workspace` on a feature
   branch created from the latest `origin/dev`.
2. Do not run lint, build, test, or CI-reproduction checks in the default local
   phase. Review the final diff and workspace status, then stop and provide a
   change report for user review.
3. Do not push a branch, create a pull request, merge, deploy, execute a
   production mutation, or run a production database migration before that user
   review and explicit approval for remote delivery.
4. After the user approves remote delivery, push the feature branch and create a
   pull request targeting `dev`. Repository-change PRs must target `dev` only.
   Never create a direct PR to `main` and never push repository changes directly
   to `main`.
5. Track the actual GitHub Actions run for the PR. Merge into `dev` only after all
   required CI checks are green. The user's approval to "push/open a PR to dev
   and track CI" includes authorization to merge that reviewed change into `dev`
   once CI is fully green, unless the user explicitly asks for another review
   before merge.
6. After a reviewed PR is merged into `dev` with all required GitHub Actions checks
   green, if the broader user-requested task, migration phase, or work package is
   not yet complete, conclude the handoff with a concise description of the
   recommended next step, including its goal, scope, important prerequisites or
   risks, and any user authorization or production verification required before
   proceeding. If the broader task is complete, state that explicitly rather than
   inventing additional work. Do not start the next step automatically unless it
   has already been authorized by the user.
7. Promotion from `dev` to `main`, if ever required, is outside the MCP/assistant
   repository-change PR workflow. This workflow must never create a PR targeting
   `main`; report the required release step for the user to control separately.

Keep changes small and reviewable. Do not combine unrelated cleanup, renaming,
dependency upgrades, schema changes, formatting sweeps, or architecture moves
with a feature or bug fix. Prefer a sequence of independently valid vertical
slices over a long-lived, repository-wide refactor branch.

Existing violations are migration debt, not precedent. A scoped task does not
require repairing every pre-existing violation in a touched area, but it must
not create a new violation, broaden an allowed exception, or make the measured
dependency graph worse. Planned modularization work must reduce and eventually
remove those exceptions.

---

## 11. Architectural direction

SanQ is a **modular monolith**, not a microservice migration project.

Preserve the current natural deployment units unless the user explicitly
authorizes a topology change:

* Next.js Web/PWA/POS UI (`apps/web`)
* NestJS API (`apps/api`)
* dedicated UberEats worker runtime process/container
* Windows printer agent (`tools/printer-server`)
* PostgreSQL as the system database

The API and UberEats worker are separate runtime processes/containers but share
the single `sanq-app-api:latest` image built from `Dockerfile.api` by the `api`
service. Do not perform a second worker image build. After rebuilding the API
image, recreate the API and/or worker containers only as required so they use the
intended shared image version.

Modularization means making ownership and dependency direction enforceable
inside those deployment units. It does not mean a rewrite, creating network
calls between internal modules, splitting databases, or adding queues and
repositories without a concrete consistency or substitution need.

Use three levels of module maturity:

* **L1 boundary module:** simple configuration, CRUD, or read model. Requires a
  clear owner, narrow public API, thin transport adapters, and an architecture
  rule preventing internal imports.
* **L2 business module:** rules or replaceable external capabilities. Adds
  application use cases, domain/policy code where useful, infrastructure
  adapters, ports, and focused rule tests.
* **L3 critical workflow:** orders, payments, financial benefits, fulfillment,
  UberEats, printing delivery, and accounting. Adds explicit transaction
  boundaries, idempotency, durable events/outbox where required, recovery,
  reconciliation, auditability, and contract/end-to-end tests.

Do not manufacture empty layers, pass-through facades, one-implementation
repositories, or chains of DTO-to-DTO copying merely to resemble a template.
Add a layer or mapping only when it enforces ownership, protects an external or
persistence boundary, contains business rules, or has a real testing value.

---

## 12. Business contexts and ownership

Every business fact has one owner. Admin, POS, Web pages, and external providers
are access channels or adapters; they are not alternative owners of the same
business data.

| Context | Owns | Must not own |
| --- | --- | --- |
| Architecture foundations | neutral ID/Money/Time primitives and boundary tooling | store, order, offer, customer, or provider business rules |
| Brand / Store | brand and store profiles, hours, notices, store configuration, stable store identity | order, payment, promotion, or messaging decisions |
| Catalog / Pricing / Offers | products, categories, modifiers, packaging, availability, pricing, daily specials, offer stacking rules | customer entitlements, order lifecycle, provider protocols |
| Identity / Customer / Benefits | authentication and challenges; customer profile/address/consent; points, balance, coupons and their reservations | payment-provider transport, order status, message delivery implementation |
| Commerce / Orders / Fulfillment | quote/order snapshots, order aggregate and lifecycle, amendments, fulfillment intent | Clover/Uber wire schemas, benefit ledgers, printer drivers |
| Payments / Clover | payment attempts/transactions, tenders, refunds/voids, reconciliation, provider adapters | order rules, menu facts, kitchen state, loyalty policy |
| Store Operations / POS / Print | store-facing interaction use cases, device operation, print jobs, delivery/ack/retry and printer agent | order aggregate, payment truth, Uber business facts |
| External Channels | UberEats/UberDirect wire protocols, mapping, inbound idempotency, provider commands and worker behavior | canonical menu/order ownership |
| Messaging / Notifications | templates, rendering, delivery routing, provider receipts, unsubscribe/suppression | why an order, offer, or auth challenge should be sent |
| Accounting / Reporting / Analytics | immutable ledger facts, expenses, periods, settlements, reconciliation, read models and telemetry | mutating canonical order or payment facts |
| Web / PWA | route composition, client state, view models, localization, caching and UI adapters | server-side business policy or provider secrets/protocols |
| Runtime / Data / CI / Ops | typed configuration, health/readiness, deployment, backup/restore, retention and quality gates | business policy |

When ownership is unclear, do not place the code in `common`, `admin`, `pos`, or
an arbitrary existing service. Resolve and document the owner first.

---

## 13. API module and dependency rules

The target structure for a fully migrated bounded context is:

```text
apps/api/src/contexts/<context>/
  public-api.ts
  contracts/
  api/
  application/
  domain/             # only when business invariants justify it
  infrastructure/
  architecture.spec.ts
```

Existing directories may migrate incrementally. Do not perform a repository-wide
path rename merely to establish this shape.

Dependency direction for new or migrated code:

* `domain` depends only on its own framework-free domain code and truly neutral
  primitives. It must not import NestJS, Prisma, controllers, infrastructure,
  providers, or another context.
* `application` depends on its own domain/contracts and application-owned ports.
  External services, databases, clocks, queues, messaging, and other contexts
  are represented by narrow capabilities.
* `api` is a transport adapter. Controllers/guards validate protocol and auth,
  call application use cases, and map results. They do not contain pricing,
  order, payment, benefit, or provider business rules.
* `infrastructure` implements application ports and contains Prisma, provider,
  worker, crypto, filesystem, and device adapters. Provider and database shapes
  are mapped at this boundary and must not leak inward or sideways.
* During modularization, progressively remove direct dependencies on Prisma
  Client, Prisma delegates, and Prisma-generated types from domain/application
  and other business-layer code. Prefer application-owned ports or narrow
  persistence capabilities, and map Prisma models/types inside infrastructure so
  a later Prisma major-version upgrade is largely infrastructure-scoped. Do not
  manufacture repository abstractions for simple L1 read models unless they
  protect a real persistence boundary or provide concrete substitution/testing
  value.
* a module/composition root wires implementations to ports. Wiring is not a
  place for business logic.

Cross-context rules:

* New cross-context business imports must use the owner context's
  `public-api.ts`, stable `contracts/`, or a narrow port. Do not deep-import its
  controller, concrete service, repository, Prisma delegate/type, internal DTO,
  domain entity, or infrastructure adapter.
* Nest composition roots may import public Nest modules for wiring. This does
  not authorize business code to import the other module's internals.
* Do not solve a dependency cycle with `forwardRef`, a global module, a service
  locator, duplicated logic, or a new `common` helper. Fix the ownership or add
  explicit orchestration/ports.
* `common` must remain framework-level or business-neutral. It must not import
  Prisma or a business context.
* Shared packages own their own contracts. Do not make one business package
  re-export another package's contracts as a compatibility shortcut.
* Public APIs should expose the smallest stable capability required by a
  consumer. Do not export an entire service merely because one method is needed.

Cross-context workflows belong in an explicit orchestration/application layer.
An orchestrator may coordinate public use cases from multiple contexts, but it
must not become a new data owner, contain provider transport, bypass a context's
invariants, or update another context's tables directly.

---

## 14. Data, identity, money, and transaction boundaries

In addition to section 3.1:

* Public/browser/WebSocket/print/worker/provider boundaries use stable business
  IDs. Internal database IDs stay inside the owning persistence boundary unless
  a documented internal relation specifically requires them.
* New ambiguous identity names such as `storeId`, `orderId`, or `userId` are not
  allowed where both DB and stable identities exist. Use `storeDbId`,
  `storeStableId`, `orderStableId`, `userStableId`, and similarly explicit names.
* Money is represented as integer minor units with an explicit currency. Do not
  use floating-point values for persisted or contractual financial facts.
* Store-local time decisions require an explicit IANA timezone. Do not rely on
  the VM, container, database, or browser default timezone.
* Orders retain immutable menu, option, pricing, discount, tax, customer-visible
  label, and payment-summary snapshots needed to explain historical facts.
  Historical orders must not be re-priced or re-described from current catalog
  or promotion state.
* A context writes its own tables. Another context consumes a public use case,
  port, versioned fact/event, or purpose-built read model; it does not reach into
  the owner's Prisma delegate.
* A database transaction is owned by the use case that protects the invariant.
  Do not create a hidden transaction spanning unrelated contexts. Use explicit
  orchestration, reservations, durable outbox/inbox, idempotency, and
  reconciliation when atomic cross-context completion is impossible.
* Financial, order, webhook, message, and print operations that may be retried
  require stable idempotency identities. Timeout or lost response is not proof
  of failure; preserve `UNKNOWN`/reconciling semantics where an external action
  may have succeeded.

Prisma schema fields are persistence contracts, not automatically public or
domain contracts. Map them once at the ownership boundary. Raw provider payloads
may be retained only for a documented audit/replay need, with secrets and
sensitive data removed and an explicit retention policy.

---

## 15. Existing critical architecture boundaries

### 15.1 Payments and Clover

`docs/payments/clover-pos-integration-charter.md` and
`apps/api/src/payments/payments-architecture.spec.ts` are binding for payment
work.

* Payments is the only owner of payment lifecycle and provider transaction
  truth.
* Clover is Payments infrastructure, separated by capability: Ecommerce
  execution, REST Pay Display terminal execution, Platform REST canonical
  reads, OAuth/device integration, and webhooks.
* Orders and POS must not import Clover or Payments infrastructure.
* Payments must not own order, fulfillment, kitchen, print, customer-benefit, or
  Uber business rules.
* Orders + Payments + Benefits coordination belongs in explicit orchestration.
* Do not broaden the exact legacy Clover-to-Orders exception tracked by the
  architecture test.
* Existing production Web Ecommerce and POS compatibility paths remain until
  the charter's gated cutover and deletion criteria are satisfied.

### 15.2 UberEats

`apps/api/src/integrations/ubereats/ARCHITECTURE.md` and all UberEats
architecture tests are binding for Uber work.

* Preserve its single `ubereats.module.ts` composition root, `worker.ts` worker
  entry, and `public-api.ts` business boundary.
* Code outside the bounded context must not deep-import Uber `api`,
  `application`, `domain`, `contracts`, or `infrastructure` internals.
* Uber wire contracts, credentials, persistence, rate limiting, retries, and
  mapping stay within the integration boundary.
* Uber does not own canonical SanQ menu or order facts. Provider changes are
  translated at the boundary rather than added to Orders, Catalog, POS, or Web
  domain contracts.

Architecture tests encode permanent decisions, not incidental implementation
details. Update a boundary assertion only when the architecture itself is
intentionally changing and the user has explicitly approved that change. Never
weaken it just to allow a convenient import.

---

## 16. Web, PWA, Admin, Accounting, and POS UI rules

App Router pages and layouts are composition boundaries. New complex behavior
belongs in feature-owned hooks, state machines/reducers, API adapters, and
presentational components rather than a growing `page.tsx`.

Target Web feature ownership includes:

```text
catalog
cart-checkout
member
admin
pos
accounting
ubereats
payments
```

Rules:

* Use one canonical API client and response-envelope parser. Direct `fetch` is
  limited to the canonical client/BFF, streaming or binary transport, and
  documented protocol adapters.
* Shared server/Web contracts come from their owning contract package. Do not
  redeclare public DTOs or response envelopes inside pages.
* Provider SDK initialization and protocol handling live behind one feature
  adapter. Secrets never enter browser bundles, URLs, logs, or public runtime
  configuration.
* Presentation components do not perform business mutations. Hooks/adapters do
  not reimplement server pricing, discount, entitlement, payment, order-state,
  or accounting rules.
* Admin is a management adapter to owner-context use cases, not a business
  domain. Accounting UI is an adapter to Accounting contracts. POS is a store
  operations adapter to Orders, Payments, Benefits, Store, and Print public
  capabilities.
* Admin and Accounting must both support narrow and wide layouts, but their primary
  design targets are different. Admin is **wide-screen/desktop-first**: optimize
  information density, multi-column editing, tables, batch actions, and efficient
  management workflows for desktop use, while keeping narrow-screen operation
  complete and usable. Accounting is **narrow-screen/mobile-first**: optimize
  receipt capture/upload, expense entry, review, and routine accounting workflows
  for phone use, while using wider screens to enhance comparison, preview, tables,
  and information density. Reuse accessible form, card, table/list, drawer,
  dialog, upload, feedback, and navigation primitives without forcing the
  customer-site header or customer navigation into staff consoles.
* Preserve localization, keyboard access, visible focus, touch target size,
  loading/empty/error states, and reduced-motion behavior when extracting UI.
* PWA/service-worker clients may run old bundles. Removing or renaming public
  fields, routes, assets, or print contracts requires an expand-observe-contract
  plan, version telemetry where relevant, and an explicit cache/update path.

For hand-written production code, a new or materially expanded page/container
over 500 lines requires an explicit decomposition review. A file over 800 lines
must be split by cohesive responsibility or carry a documented, user-approved
exception. Existing oversized files are migration debt rather than a reason to
expand scope: an unrelated scoped fix does not require splitting them, but the
change must not materially increase their responsibility. Split them when the
task is a redesign/modularization or when the requested change would
substantially expand the file. Generated protocol code and fixed data tables may
be exempt.

---

## 17. External integrations, printing, and security

External integrations are anti-corruption layers:

* Provider request/response/webhook types remain inside the provider adapter.
* Convert a provider wire shape once into a canonical SanQ command/event/result.
  Do not pass provider DTOs through Orders, POS, Accounting, or Web components.
* All externally retried commands and inbound events require explicit
  idempotency, authentication/verification, replay handling, structured logs,
  and actionable failure/reconciliation behavior.
* Do not guess success from matching amount/time, invent missing provider IDs,
  or convert unknown outcomes into failure.
* Credentials and signing/encryption keys are server-only, validated at startup,
  redacted in logs, and never committed. Production credentials must not be used
  to compensate for an unavailable sandbox/test environment.

Printing is a delivery boundary. Orders/Payments provide stable snapshots;
Print owns job identity, template version, routing, retry and acknowledgement;
the Windows agent owns rendering and device I/O. A reconnect or duplicate job
must not produce an uncontrolled duplicate print. Changes to receipt, kitchen,
or label contracts require fixture/golden coverage and backward compatibility
with deployed agents until their versions are observed and retired.

---

## 18. Migration and compatibility discipline

Choose exactly one migration class before implementation:

### A. Atomic internal migration

Use only when there is no persisted or external contract and all consumers can
be changed together. Move implementation, update all imports/tests, and delete
the old path in one PR. Do not leave aliases, deprecated re-exports, duplicate
directories, or speculative compatibility facades.

### B. Expand-contract migration

Required when persisted, public, external, or independently deployed consumers
cannot be updated atomically, or when an existing field, route, identifier,
meaning, protocol, or historical fact is renamed, removed, replaced, or
semantically changed. Typical cases include Prisma data, stable IDs, PWA clients,
print protocols, shared/public contracts, and historical accounting facts.

A purely additive backward-compatible field or endpoint that requires no
persisted backfill and does not force an independently deployed consumer to
change may remain an ordinary compatible change rather than using the full
expand-contract sequence.

When expand-contract is required:

1. audit current data/consumers and define invariants;
2. add the new field/table/contract without removing the old one;
3. perform an idempotent backfill with counts and discrepancy reporting;
4. dual-write only when necessary and record its owner and exit condition;
5. shadow-read/compare rather than silently falling back;
6. cut reads after parity is demonstrated and observe a full relevant business
   cycle;
7. stop old writes and prove old usage is zero;
8. remove old data/code/config/tests/docs in a separate authorized contraction.

### C. Controlled critical cutover

Required for payments, fulfillment, Uber/provider workflows, and other
externally observable critical paths. In addition to class B, require feature
flags or scoped rollout, idempotency, replay/reconciliation, dead-letter or
operator recovery, old/new parity metrics, explicit rollback/cutback conditions,
and no rewriting of historical facts during rollback.

Every non-atomic compatibility path must be registered with:

```text
compat_id
old_owner / new_owner
dual_write_or_read paths
parity metric
rollback/cutback plan
exit criteria
removal task/PR
deadline or business milestone
```

Compatibility is temporary infrastructure, not a permanent fallback. Operational
retry/failover is different from legacy compatibility and must be named and
tested accordingly.

---

## 19. Current modularization sequencing and provider-change gates

The user explicitly lifted the structural freeze on the UberEats integration on
2026-09-02 so the integration can be made production-ready before real production
traffic begins. UberEats code under `apps/api/src/integrations/ubereats/**` may now
be refactored, contracted, renamed, or have internal/public application contracts
changed when required by the approved modularization task, subject to the normal
architecture-boundary rules in this file and the Uber-specific verification gate
below.

The Clover developer/sandbox merchant identity blocker is still open. Until the
user explicitly confirms that blocker is closed:

* do not structurally reorganize Payments/Clover OAuth, terminal communication,
  provider infrastructure, unified-payment orchestration, or their direct
  Orders/POS contracts;
* do not delete current Clover/payment compatibility paths or widen payment
  feature-flag rollout;
* narrowly scoped Clover provider-verification or support-requested fixes are
  allowed, but they must preserve current module boundaries and receive normal
  focused regression coverage;
* if a Clover support response requires an architecture change, present its
  impact and alternatives and obtain explicit authorization before implementation.

### UberEats modification verification gate

UberEats changes must proceed as small, independently deployable slices. For each
slice that changes UberEats runtime behavior, identity, persistence, transport,
composition, menu, order, store-status, reconciliation, operations, worker, or
provider integration behavior:

1. before implementation, identify the affected UberEats capabilities and preserve
   unrelated verified flows;
2. after the local change, report the exact affected files/contracts and provide
   focused active test steps for every affected capability, including expected
   UI/API behavior and relevant sanitized log/DB evidence where useful;
3. after CI passes and the slice is deployed, perform or have the user perform the
   focused active tests instead of waiting for organic traffic;
4. do not begin the next UberEats code slice until the affected tests from the
   current slice have been confirmed successful by the user;
5. if an active test exposes a regression, stop the sequence and fix/verify that
   slice before continuing;
6. continue this slice-by-slice gate until the approved UberEats integration work
   is fully contracted and production-ready.

External Uber wire protocols, webhook signatures, idempotency semantics, order
state transitions, and provider truth remain critical contracts. A task that must
change one of those external behaviors still requires an explicit impact report,
rollback/cutover plan, and user authorization before that specific behavior is
changed. Lifting the structural freeze does not waive those critical-cutover rules.

Productive modularization work may proceed in this order:

1. baseline and guardrails: dependency graph, architecture tests, ID inventory,
   compatibility register, characterization tests;
2. low-risk deduplication and public-contract cleanup;
3. responsive Admin/Accounting shells and reusable staff UI primitives, without
   moving business ownership into the UI;
4. Brand/Store identity and configuration, including the now-unfrozen UberEats
   Store-identity contraction under the verification gate above, then
   Catalog/Pricing/Offers;
5. Identity/Customer/Benefits and Messaging boundaries;
6. Orders/Fulfillment after characterization coverage, with extra care around the
   still-frozen payment contracts and any UberEats flows affected by the current
   verified slice;
7. Payments/Clover and POS terminal critical cutovers after the Clover blocker is
   resolved; UberEats may proceed before that point under its slice verification
   gate.

Each modularization PR should establish or improve one enforceable boundary and
remain deployable on its own. Recompute or rerun applicable dependency/architecture
checks at the end of every slice. A phase is not complete if it introduces a new
cycle, new internal cross-context import, ambiguous identity, duplicate active
implementation, or unregistered compatibility path.

---

## 20. Testing requirements for modularization and refactoring

Refactoring must prove behavior preservation; compilation alone is insufficient.

* Add characterization tests before moving unclear pricing, order, benefit,
  payment, fulfillment, notification, printing, or accounting behavior.
* Add or update architecture tests when creating a context public API, moving an
  owner, forbidding an import, or retiring a known exception.
* Test domain/application rules without NestJS, Prisma, network, filesystem, or
  provider SDK dependencies wherever the boundary permits.
* Provider adapters require sanitized representative fixtures and mapping,
  authentication, idempotency, retry, error, and unknown-outcome tests.
* Contract changes require validating all API, Web, worker, printer, and shared
  package consumers. Snapshot/golden tests must assert business-relevant content,
  not unstable formatting noise.
* A moved implementation is not complete while both old and new active paths
  remain, unless an approved class B/C migration explicitly requires them.
* For defect fixes, add a regression test that fails for the original cause when
  practical. Do not overfit to an incidental private method call.

The repository's architecture tests and GitHub CI are minimum gates. Passing CI
does not by itself prove module ownership, data parity, production cutover, or
external-provider verification; report those separately and accurately.
