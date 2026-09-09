# Phase 8 — External Channels Boundary Contraction & L3 Resilience

Status: **PLANNED — Slice 0 READ-ONLY AUDIT AUTHORIZED**  
Initial planning baseline: `origin/dev@d1c7d7b3e968d99dce1e3df39ca1af04a7696883`  
Baseline merge: PR `#2258` — Phase 7 Slice 5B  
Planning date: 2026-09-09

## 1. Purpose

Phase 8 owns the next-stage contraction and resilience work for **External Channels**, with UberEats as the current critical provider integration.

This phase does **not** re-modularize or flatten the existing UberEats internal architecture. The current Uber integration already follows the repository's intended critical-integration shape: API/adapters, application use cases, contracts/ports, domain logic, infrastructure/provider adapters, composition wiring, and an explicit public surface. Phase 8 therefore focuses on the remaining seams **around** that implementation:

- cross-context imports that still bypass owner public surfaces;
- runtime/persistence dependencies that may have escaped infrastructure/composition boundaries;
- provider wire types or provider identity leaking into canonical SanQ workflows;
- critical webhook/command/menu/status/delivery flows whose idempotency, replay, reconciliation, or crash recovery are incomplete;
- compatibility paths that can only be removed after explicit production cutover evidence.

The phase is governed as an **L3 critical workflow** change. Correctness, retry safety, durable recovery, explicit ownership, and production evidence take priority over raw file count or raw dependency-count reduction.

## 2. Authoritative starting baseline

The latest merged `dev` baseline used for this phase is:

- `dev` HEAD: `d1c7d7b3e968d99dce1e3df39ca1af04a7696883`;
- merged through PR `#2258` on 2026-09-09;
- public context SCC remains empty at the current architecture baseline;
- no Phase 8 production implementation has been changed by this planning commit.

Current raw production import allowances involving External Channels are:

### External Channels outgoing

| Target context | Raw production import statements |
|---|---:|
| architecture-foundation | 11 |
| commerce-orders-fulfillment | 1 |
| identity-customer-benefits | 6 |
| runtime-data-ci-ops | 24 |
| **Total** | **42** |

### External Channels incoming

| Source context | Raw production import statements |
|---|---:|
| identity-customer-benefits | 1 |
| store-operations-pos-print | 1 |
| accounting-reporting-analytics | 1 |
| **Total** | **3** |

These are **raw import counts, not an automatic debt count**. Public API/contracts/ports and legal composition/runtime wiring are permitted architecture. Phase 8 must classify each edge before deciding whether it should contract.

A prior informal planning note quoted `41` outgoing imports and `10` foundation imports. The current checked-in dependency graph is authoritative and corrects that to **42 total / 11 foundation**.

## 3. Architecture position and invariants

Phase 8 uses the following invariants.

1. **No cross-context internal implementation import.** Cross-context business use must flow through the owner context's `public-api`, public contract, capability token, or application-owned port.
2. **No provider-wire leakage.** Uber request/response DTOs, provider UUIDs, provider status enums, or provider transport concerns must not become Orders/Catalog/POS/Accounting canonical contracts.
3. **Runtime and persistence remain infrastructure concerns.** Prisma, provider HTTP clients, scheduler/worker bootstrap, config, and persistence adapters may exist in External Channels infrastructure/composition where appropriate, but must not become application/domain facts.
4. **Raw edge count is not a quality target.** A legal public dependency must not be replaced with a meaningless facade merely to make a scanner number smaller.
5. **Public SCC remains empty.** No Phase 8 slice may reintroduce a public cross-context cycle.
6. **L3 side effects are retry-safe and recoverable.** Webhooks, provider mutations, menu publication, store-status synchronization, and external delivery workflows require explicit idempotency/replay/reconciliation behavior.
7. **Compatibility removal is evidence-gated.** Production/sandbox/cutover compatibility is removed only when its registered exit criteria and production evidence are satisfied.
8. **Production Web Clover remains outside this phase.** Phase 8 does not use External Channels work as a reason to reopen protected production Web Clover payment behavior.

## 4. Non-goals

Phase 8 will not:

- flatten or re-split UberEats merely to reduce file count;
- create pass-through facades whose only purpose is to hide a legal import from the architecture graph;
- upgrade Prisma major versions;
- redesign Payments / Clover Terminal orchestration;
- change production Web Clover behavior unless a separately governed blocker is proven and explicitly authorized;
- delete versioned provider events, webhook handlers, queue/replay paths, or compatibility code solely because static search finds no TypeScript caller;
- require all 42 External Channels outgoing raw imports or all 3 incoming raw imports to become zero.

## 5. Slice plan

### Slice 8.0 — Readiness, dependency classification, and characterization

**Mode:** read-only audit plus tests/docs only if separately authorized. No production implementation change.

Inventory every current External Channels cross-context import and classify it as one of:

- legal owner public API / public contract;
- legal composition wiring;
- legal infrastructure/runtime dependency;
- application-owned port with correct dependency direction;
- internal implementation-path debt;
- provider-type leakage;
- unresolved ownership/dependency-direction question.

Also inventory:

- webhook, order-admission, scheduled-order, menu publication, availability, store-status, reporting, and UberDirect critical workflows;
- characterization/spec coverage for duplicate, retry, restart, provider-timeout, reconciliation, and partial-failure behavior;
- active/closed compatibility entries and production-source `@compat` references;
- remaining default-store/provider-identity fallback behavior;
- durability/replay gaps already recorded by earlier phases, especially external-delivery provider success followed by local persistence failure.

**Exit criteria:** every candidate planned for Slice 8.1/8.2 has an exact source file, target owner, current import path, intended canonical replacement, risk class, and required regression/active verification.

### Slice 8.1 — Identity / Auth boundary contraction

Review the six External Channels -> Identity/Customer/Benefits imports and relevant composition wiring.

Target state:

- authentication/security policy remains owned by Identity/Auth;
- Uber controllers/composition consume only intended public security/auth capabilities;
- Uber application/domain code does not import Auth implementation details;
- existing Benefits/customer public contracts remain intact where they are already the correct boundary;
- no fake Uber-specific auth facade is introduced merely for graph reduction.

**Exit criteria:** every remaining External -> Identity edge is intentionally public/composition traffic; internal Auth implementation-path imports from External Channels are zero.

### Slice 8.2 — Runtime / Prisma / Foundation containment

Classify the current 24 External -> Runtime/Data/Ops imports and 11 External -> Foundation imports by architectural layer.

Target state:

- Prisma and provider persistence remain under infrastructure/composition ownership;
- application/domain do not depend on `PrismaService`, generated persistence models, transaction clients, or runtime bootstrap/config implementation as business facts;
- foundation imports are true cross-cutting primitives, not misplaced External business policy;
- legitimate `PrismaModule`/worker/config/logging wiring is retained rather than wrapped for cosmetic dependency-count reduction.

**Exit criteria:** no persistence/runtime implementation leaks into External application/domain; any retained raw runtime/foundation imports are documented as legal and scanner-protected by the normal architecture rules.

### Slice 8.3 — Canonical External Channel workflow boundaries

Audit and contract the provider anti-corruption seams for:

1. Uber webhook/order admission -> canonical Uber command/event -> Orders public capability;
2. Catalog/menu/availability canonical facts -> Uber application use case -> provider mapper/API;
3. Brand/Store status truth -> Uber status synchronization/reconciliation;
4. External reporting read model -> Accounting public consumer;
5. UberDirect fulfillment/delivery -> Orders/Fulfillment-owned capability/port.

Target state:

- Orders, Catalog, POS, Store, and Accounting do not consume Uber wire DTOs or provider persistence models;
- External Channels translates between canonical SanQ facts and provider-specific contracts at its boundary;
- the existing public APIs are reused when already correct rather than replaced for stylistic consistency.

### Slice 8.4 — L3 idempotency, replay, reconciliation, and crash recovery

Characterize and harden critical side effects for at least:

- duplicate webhook delivery;
- out-of-order provider notifications;
- duplicate immediate/scheduled order notifications;
- accept/reject retry and ambiguous provider timeout;
- menu publish retries and reconciliation;
- availability/store-status divergence and reconciliation;
- worker restart/replay;
- UberDirect create/cancel/status recovery;
- provider-success/local-commit-failure split-brain cases.

Each provider mutation must have an explicit answer for:

- what happens on duplicate execution;
- how the system recovers if the process stops at each durable boundary;
- how SanQ determines/reconciles authoritative local and provider state.

Known Phase 5 follow-up: the UberDirect path where provider success can precede durable local `externalDeliveryId` persistence must be re-audited here and either closed or explicitly retained with a documented recovery mechanism.

### Slice 8.5 — Production-cutover compatibility cleanup

**Mode:** conditional. Do not implement removal without production evidence and the applicable registered cutover gate.

Candidates include:

- implicit/default-store fallbacks;
- sandbox/test-only compatibility retained for provider verification;
- obsolete versioned event compatibility;
- transitional provider routes/branches;
- closed compatibility annotations that remain in production source.

Scanner hardening candidate:

- `active` compatibility IDs may be referenced by production source;
- `closed` compatibility IDs should have production-source annotation/reference count `0` unless a specifically documented non-production historical reference is exempted.

This scanner rule must be validated against the actual compatibility registry and current annotation semantics during Slice 8.0 before implementation.

### Slice 8.6 — Closeout

Re-run architecture scanner, dependency graph, compatibility inventory, critical-workflow tests, and normal CI gates.

Phase 8 closes only when:

- public SCC remains empty;
- External cross-context internal implementation imports are zero;
- provider wire/provider persistence leakage into other business contexts is zero;
- External application/domain persistence/runtime leaks are zero;
- retained public/runtime/composition crossings are intentional and documented;
- webhook/command/menu/status/delivery critical paths have explicit idempotency and recovery evidence;
- eligible closed compatibility paths are removed only after cutover evidence;
- Phase 8 plan, current dependency graph, modularization worklog, and final merged-head evidence are synchronized according to repository documentation gates;
- final-head CI passes the architecture scanner plus API/Web lint/build/strict/test gates required by the repository.

## 6. Slice 8.0 audit checklist

Slice 8.0 must produce a concrete readiness table, not only a prose review.

- [ ] Confirm exact `dev` base and no newer merged commit appeared before audit start.
- [ ] Enumerate all production files under `apps/api/src/integrations` relevant to the External context.
- [ ] Resolve the exact 42 outgoing raw imports to file/path/symbol/layer.
- [ ] Resolve the exact 3 incoming raw imports and determine whether each uses an approved public surface.
- [ ] Identify the single External -> Orders import and classify public vs implementation-path.
- [ ] Classify all six External -> Identity/Customer/Benefits imports.
- [ ] Classify all 24 Runtime/Data/Ops imports by application/domain/infrastructure/composition location.
- [ ] Classify all 11 Foundation imports and identify misplaced business policy, if any.
- [ ] Search for cross-context imports bypassing `public-api`/registered contract boundaries.
- [ ] Search for provider DTO/model/enum leakage into Orders, Catalog, POS, Store, Accounting, and shared packages.
- [ ] Inventory Uber public exports and verify actual external consumers.
- [ ] Inventory critical workflow tests/specs and identify missing duplicate/retry/restart/partial-failure characterization.
- [ ] Inventory active/closed compatibility IDs and production-source `@compat` references.
- [ ] Audit default-store/provider-identity fallbacks.
- [ ] Re-audit UberDirect durable fulfillment recovery debt.
- [ ] Produce recommended Slice 8.1 and 8.2 exact file scopes, tests, risks, and active verification requirements.

## 7. Change-control gates

Slice 8.0 is read-only unless separately authorized. Any later code slice must obey `AGENTS.md` and the repository modularization documentation synchronization gate.

For a modularization code slice, the same change must keep at least the relevant phase plan/checklist, `docs/architecture/current-dependency-graph.md`, and `docs/architecture/modularization-worklog.md` synchronized. Pre-merge expected state must not be presented as final merged/CI/production proof; final evidence is recorded only after the corresponding merge/deploy gate actually completes.

Any slice requiring a new architectural exception, responsibility transfer, Prisma schema/migration, or change to a protected production boundary must stop for explicit authorization before implementation.

## 8. Planning audit notes

- Phase 7 Slice 5B is already merged in `dev` through PR `#2258`, while some Phase 7 documentation wording still describes 5B as local/pending. This is documentation drift and must not be used as the source of truth for the Phase 8 code baseline.
- The latest checked-in dependency graph, not the older informal count, establishes External outgoing raw imports at `42`.
- Slice 8.0 must distinguish legal public/composition/runtime dependencies from true debt before any contraction target is set.

## 9. Status log

### 2026-09-09 — Phase 8 planning document

- base: `dev@d1c7d7b3e968d99dce1e3df39ca1af04a7696883`;
- mode: documentation only;
- production code: unchanged;
- schema/migration: unchanged;
- provider wire behavior: unchanged;
- architecture allowance/baseline counts: unchanged;
- next authorized action: **Slice 8.0 read-only readiness audit**.
