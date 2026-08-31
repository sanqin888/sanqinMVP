# Benefits Loyalty policy contraction implementation plan

Date: 2026-08-30
Baseline: `origin/dev` at `483f675f`
Compatibility entry: `benefits.business-config-loyalty-policy.v1`
Status: Admin Business contract contraction plus Phase A dedicated persistence expand/backfill and Phase B triple-write/shadow-read are implemented; Phase C read cutover, trigger split, dual-write removal, and final column contraction remain pending.

## 1. Scope and current ownership

The Loyalty program policy contains exactly these ten fields:

- `earnPtPerDollar`
- `redeemDollarPerPoint`
- `referralPtPerDollar`
- `tierMultiplierBronze`
- `tierMultiplierSilver`
- `tierMultiplierGold`
- `tierMultiplierPlatinum`
- `tierThresholdSilver`
- `tierThresholdGold`
- `tierThresholdPlatinum`

The application owner is Identity / Customer / Benefits through the public contracts in `apps/api/src/loyalty/public-api.ts` and `apps/api/src/loyalty/loyalty-policy.contract.ts`.

Current runtime consumers are already cut over:

- Admin Members reads and writes through `GET/PATCH /admin/benefits/loyalty-policy`.
- POS payment reads through `GET /pos/loyalty-policy`.
- Orders quote/create redemption conversion reads `redeemDollarPerPoint` through `LOYALTY_POLICY_READER`.
- LoyaltyService transaction and non-transaction policy reads use the Benefits-owned policy implementation.
- Admin Settings no longer declares or resubmits Loyalty fields.

The remaining debt is persistence and rollback compatibility, not business ownership.

## 2. Static audit: old Admin Loyalty write entry

Two Admin Business endpoints still accept the ten Loyalty fields because both delegate to `AdminBusinessService.updateConfig()`:

- `PATCH /admin/business/config`
- `PUT /admin/business/temporary-close`

No known Web consumer currently sends or reads Loyalty fields through either route. Staff Web consumers have now moved Brand/Store configuration and timezone reads to the Brand/Store-owned `/staff/brand/*` and `/staff/store/*` contracts; `/admin/business/*` remains a server-side compatibility adapter only.

Therefore the pre-contraction target is:

- known browser Loyalty use of the old Admin Business routes = **0**;
- server rollback compatibility surfaces = **2**, explicitly registered and isolated;
- new direct BusinessConfig Loyalty persistence consumers = **0** outside the registered Benefits Phase B triple-writer.

The architecture scanner must keep these invariants from regressing before the actual contract contraction.

## 3. Why BusinessConfig still has to stay synchronized today

`20260819233000_add_store_config_foundation/migration.sql` created the one-way trigger:

`BusinessConfig -> syncBusinessConfigToCanonicalConfig() -> BrandConfig + StoreConfig`

The trigger runs after every insert/update of singleton `BusinessConfig(id=1)`. Its BrandConfig upsert currently includes all ten Loyalty fields.

This creates a stale replay hazard:

1. Benefits writes a new Loyalty policy to BrandConfig.
2. If BusinessConfig keeps an older Loyalty copy, an unrelated legacy Admin Business update later fires the trigger.
3. The trigger can replay the stale BusinessConfig Loyalty values back into BrandConfig.

For that reason `PrismaLoyaltyPolicyWriter` now writes the complete next policy to LoyaltyProgramPolicy, BusinessConfig, and BrandConfig in one transaction. BusinessConfig and BrandConfig remain compatibility copies during Phase B; LoyaltyProgramPolicy is maintained as the dedicated persistence target but is not yet the runtime return source.

## 4. Trigger Loyalty split readiness conditions

Do not remove the Loyalty portion from `syncBusinessConfigToCanonicalConfig()` until all of the following are true:

1. **Admin contract condition** — both Admin Business routes no longer accept Loyalty policy writes; Loyalty configuration is writable only through `/admin/benefits/loyalty-policy`.
2. **Browser condition** — repository-wide Web scan shows zero old Admin Business route + Loyalty-field consumers.
3. **Runtime consumer condition** — Admin Members, POS payment, Orders and LoyaltyService continue to use the Benefits boundary with no BusinessConfig Loyalty read fallback.
4. **Dedicated persistence condition** — the new Benefits-owned policy row exists, has been backfilled, and is zero-diff against the current BrandConfig policy.
5. **Write parity condition** — the deployed Benefits writer updates the dedicated Benefits row and transitional copies atomically, and mismatch telemetry/reporting is zero for the agreed observation period.
6. **Rollback condition** — the oldest application version allowed for rollback no longer relies on `BusinessConfig -> BrandConfig` propagation for Loyalty updates.
7. **Migration authorization condition** — the user has explicitly approved the Prisma migration that replaces the database trigger function.

Only then is it safe to make unrelated BusinessConfig writes incapable of changing Loyalty policy.

## 5. Contract contraction PR after business-day observation

This is the first behavior-changing PR and does **not** need a Prisma migration.

### 5.1 API changes

In `apps/api/src/admin/business/admin-business.controller.ts`:

- remove the ten Loyalty fields from the request shapes for both `PATCH config` and `PUT temporary-close`;
- keep Brand/Store request fields unchanged;
- keep the compatibility `PUT temporary-close` route itself until Brand/Store contraction decides its fate.

In `apps/api/src/admin/business/admin-business.service.ts`:

- explicitly reject payloads containing any of the ten Loyalty keys with `BadRequestException` directing callers to `/admin/benefits/loyalty-policy`;
- remove Loyalty destructuring, payload typing, normalization branches and BusinessConfig update assignments;
- remove `normalizeStrictlyPositiveNumber()` and `normalizeTierThreshold()` if they become unused;
- stop returning Loyalty fields from `BusinessConfigResponse` and `getConfig()` once the repository-wide consumer scan confirms no consumer relies on them.

Rejecting the old keys is preferred over silently ignoring them: a stale client must receive a visible contract error instead of believing that a policy save succeeded.

### 5.2 Tests/gates

Add characterization/contract coverage that proves:

- the old Admin Business routes reject a representative Loyalty field;
- normal Brand/Store updates through those routes still work;
- the Benefits Admin endpoint still accepts and persists the same valid policy update;
- Admin Settings remains free of the ten Loyalty keys.

After this PR, update the architecture baseline so the Admin Business controller/service are no longer registered as active Loyalty write adapters.

## 6. Proposed dedicated Benefits persistence

The dedicated persistence should preserve the existing global program semantics. Do not add store scoping or new business rules during this migration.

Proposed Prisma model name:

`LoyaltyProgramPolicy`

Proposed shape:

```prisma
model LoyaltyProgramPolicy {
  id                      Int      @id
  earnPtPerDollar         Float
  redeemDollarPerPoint    Float
  referralPtPerDollar     Float
  tierMultiplierBronze    Float
  tierMultiplierSilver    Float
  tierMultiplierGold      Float
  tierMultiplierPlatinum  Float
  tierThresholdSilver     Int
  tierThresholdGold       Int
  tierThresholdPlatinum   Int
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

Migration rules:

- use singleton `id = 1` explicitly;
- do not give the ten business fields new Prisma defaults;
- do not create policy values from application defaults during migration;
- backfill from the current canonical `BrandConfig(id=1)` row;
- fail the migration if the canonical source row is absent instead of inventing a policy;
- do not change rates, threshold semantics, tier ordering rules or rounding behavior in this migration.

The Phase A schema and migration were implemented after explicit Prisma/migration authorization; every later trigger/schema migration in Phases D/G still requires its own explicit authorization.

## 7. Expand-backfill-cutover sequence

### Phase A — Expand migration

Implementation status: **implemented** in `20260831133000_add_loyalty_program_policy`; this phase adds persistence only and intentionally leaves runtime readers/writers on the existing transitional storage.

Authorized Prisma migration only:

1. Create `LoyaltyProgramPolicy` with the ten current fields and timestamps.
2. Verify `BrandConfig(id=1)` exists.
3. Insert `LoyaltyProgramPolicy(id=1)` by selecting the ten values from BrandConfig.
4. Do **not** drop or rename BusinessConfig/BrandConfig fields.
5. Do **not** alter the existing BusinessConfig trigger yet.

The migration also verifies the active `BusinessConfig(id=1)` compatibility row before backfill and fails atomically if either singleton is missing.

Post-migration report must include:

- source BrandConfig row count;
- new policy row count;
- exact per-field diff between LoyaltyProgramPolicy and BrandConfig;
- exact per-field diff between BrandConfig and BusinessConfig;
- all counts must be zero-diff before cutover work continues.

The migration performs these zero-diff checks itself and raises the exact differing fields if parity is not clean; deployment verification should still record the observed counts/diffs in the rollout report.

### Phase B — Triple-write + shadow-read application release

Implementation status: **implemented locally**. Public contracts remain unchanged; `BrandConfig` is still the returned runtime policy while `LoyaltyProgramPolicy` is shadow-read for parity and maintained on every policy write.

Keep existing public contracts unchanged.

Update the Benefits persistence adapter so that a policy write, in one Prisma transaction:

1. reads the current canonical policy;
2. applies `normalizeLoyaltyPolicyUpdate()`;
3. writes `LoyaltyProgramPolicy`;
4. writes the BusinessConfig compatibility copy;
5. writes the BrandConfig transitional copy.

At this phase, runtime reads may continue returning BrandConfig while also reading/comparing LoyaltyProgramPolicy for parity. Any mismatch must be observable; do not silently fall back and hide it.

Transaction-bound Loyalty reads must compare/read through the same existing Prisma transaction client.

### Phase C — Read cutover

After zero-diff observation:

- `getLoyaltyPolicySnapshot()` reads LoyaltyProgramPolicy;
- `getLoyaltyPolicySnapshotWithTx(tx)` reads LoyaltyProgramPolicy through `tx`;
- `getLoyaltyPolicySettings()` reads LoyaltyProgramPolicy;
- public API contracts remain unchanged;
- writes continue to all three copies temporarily for rollback safety.

Observe at least one complete business cycle with zero policy mismatch.

### Phase D — Split the Loyalty portion from the BusinessConfig trigger

Authorized Prisma migration only.

Replace `syncBusinessConfigToCanonicalConfig()` so its BrandConfig insert/upsert no longer includes any of the ten Loyalty fields. Keep the existing Brand/Store synchronization behavior unchanged.

Deploy this migration while the application writer still writes all three copies. That makes the trigger change backward-safe for the currently deployed writer and proves unrelated BusinessConfig updates can no longer mutate Loyalty policy.

Required verification:

1. save an unrelated Admin Business setting;
2. confirm LoyaltyProgramPolicy is unchanged;
3. confirm BrandConfig Loyalty values are unchanged;
4. confirm BrandConfig/StoreConfig non-Loyalty fields still synchronize as expected.

### Phase E — Stop BusinessConfig Loyalty dual-write

After the trigger split is verified:

- remove `tx.businessConfig.update()` from the Benefits policy writer;
- continue writing LoyaltyProgramPolicy + BrandConfig temporarily;
- keep parity reporting between the dedicated row and BrandConfig;
- update scanner rules so any Benefits writer BusinessConfig usage fails CI.

Rollback at this stage is to a version that reads the dedicated table and still has the BrandConfig copy available; do not roll back to a version that expects BusinessConfig-triggered Loyalty propagation.

### Phase F — Stop BrandConfig Loyalty dual-write

After another zero-diff observation window:

- write only LoyaltyProgramPolicy;
- read only LoyaltyProgramPolicy;
- BrandConfig/BusinessConfig Loyalty columns become inactive schema residue;
- remove the writer's compatibility annotation only when the compatibility register is updated in the same PR.

### Phase G — Column contraction migration

Authorized destructive/contraction Prisma migration only:

- drop the ten Loyalty fields from BrandConfig;
- drop the ten Loyalty fields from BusinessConfig;
- verify the trigger function no longer references any dropped field;
- remove corresponding Prisma generated-type dependencies, tests and compatibility documentation;
- close `benefits.business-config-loyalty-policy.v1` only after production verification.

This migration must be separate from the initial expand migration.

## 8. Business-day observation checklist before contract contraction

The current deployed cutover should be observed before removing the old Admin write contract:

1. Open Admin Members and load Loyalty settings successfully.
2. Save one no-op or intentionally chosen policy value through the Benefits endpoint and confirm it reloads correctly.
3. Open POS payment and confirm the policy loads without Admin Business dependency/error.
4. Exercise an Orders quote/checkout path that evaluates points redemption and confirm the configured `redeemDollarPerPoint` is honored.
5. Open the public membership rules page and confirm current earn/referral/tier values render correctly.
6. Save an unrelated Brand/Store value through the staff Brand/Store contract, then re-open Loyalty settings and confirm no Loyalty value changed. This specifically validates that the owner-maintained compatibility copy is synchronized and the current one-way trigger cannot replay stale policy.
7. Review application logs for Benefits/Admin/POS/Orders errors around these actions. No database mutation or manual trigger change is required for this observation.

Only after this checklist is clean should the contract contraction PR in section 5 begin.

## 9. Rollback principles

- Never rewrite Loyalty ledger history during policy migration.
- Do not reinterpret historical order redemption amounts using a newer policy.
- Before trigger split, rollback may rely on synchronized BusinessConfig + BrandConfig copies.
- After trigger split, rollback must target a version that does not require BusinessConfig-triggered Loyalty propagation.
- After the dedicated read cutover, keep the previous canonical copy until the agreed observation period is complete.
- A schema contraction rollback is forward-fix only; do not recreate dropped columns from guessed defaults.

## 10. Exit criteria

`benefits.business-config-loyalty-policy.v1` can close only when all are true:

- old Admin Business Loyalty request fields are gone;
- old Admin Business Loyalty response fields are gone;
- Web old-route Loyalty consumers are zero and CI-enforced;
- runtime Benefits readers use only LoyaltyProgramPolicy;
- Benefits writer uses only LoyaltyProgramPolicy;
- BusinessConfig trigger contains no Loyalty fields;
- BrandConfig and BusinessConfig contain no Loyalty columns;
- no active `BusinessConfig` Loyalty read/write/fallback remains;
- production observation and parity reports are clean;
- the compatibility register and architecture scanner are updated in the same contraction closeout.
