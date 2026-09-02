# Benefits Loyalty policy contraction implementation plan

Date: 2026-08-30
Last updated: 2026-09-01
Current closeout baseline: `origin/dev` at `91f3d87e`
Compatibility entry: `benefits.business-config-loyalty-policy.v1` — **closed**
Status: **Phase D production contraction and direct verification are complete.** Loyalty reads/writes use only `LoyaltyProgramPolicy`; migration `20260901235900_contract_loyalty_policy_storage` is applied in production; `BrandConfig`/`BusinessConfig` no longer contain the ten Loyalty columns; the surviving BusinessConfig-to-canonical trigger contains no Loyalty propagation; targeted Admin, POS, Web pure-points/refund, public membership-rules, and unrelated Store-write verification all passed. The compatibility entry is moved from active to closed in this closeout.

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

At that stage, the remaining debt was persistence and rollback compatibility rather than business ownership; Phase D has now removed that debt.

## 2. Historical static audit: old Admin Loyalty write entry

Before the Admin Business contract contraction, two Admin Business endpoints accepted the ten Loyalty fields because both delegated to `AdminBusinessService.updateConfig()`:

- `PATCH /admin/business/config`
- `PUT /admin/business/temporary-close`

That Loyalty request/response ownership is now removed: stale Loyalty keys are explicitly rejected and callers are directed to `/admin/benefits/loyalty-policy`. No known Web consumer sends or reads Loyalty fields through either legacy route. Staff Web consumers use the Brand/Store-owned `/staff/brand/*` and `/staff/store/*` contracts; `/admin/business/*` remains a server-side Brand/Store compatibility adapter only.

Therefore the pre-contraction target is:

- known browser Loyalty use of the old Admin Business routes = **0**;
- server rollback compatibility surfaces = **2**, explicitly registered and isolated;
- new direct BusinessConfig Loyalty persistence consumers = **0** outside the registered Benefits Phase B triple-writer.

The architecture scanner must keep these invariants from regressing before the actual contract contraction.

## 3. Historical reason BusinessConfig had to stay synchronized before Phase D

`20260819233000_add_store_config_foundation/migration.sql` created the one-way trigger:

`BusinessConfig -> syncBusinessConfigToCanonicalConfig() -> BrandConfig + StoreConfig`

Before Phase D, that trigger ran after every insert/update of singleton `BusinessConfig(id=1)` and its BrandConfig upsert still included all ten Loyalty fields.

That created the stale replay hazard which justified the transitional triple-write:

1. Benefits could write a new Loyalty policy to BrandConfig.
2. If BusinessConfig kept an older Loyalty copy, an unrelated legacy BusinessConfig update could later fire the trigger.
3. The trigger could replay the stale BusinessConfig Loyalty values back into BrandConfig.

Phase D removed this hazard: the trigger no longer contains Loyalty fields, `BrandConfig`/`BusinessConfig` no longer store them, and `PrismaLoyaltyPolicyWriter` now writes only `LoyaltyProgramPolicy`.

## 4. Historical trigger Loyalty split readiness conditions

Do not remove the Loyalty portion from `syncBusinessConfigToCanonicalConfig()` until all of the following are true:

1. **Admin contract condition** — both Admin Business routes no longer accept Loyalty policy writes; Loyalty configuration is writable only through `/admin/benefits/loyalty-policy`.
2. **Browser condition** — repository-wide Web scan shows zero old Admin Business route + Loyalty-field consumers.
3. **Runtime consumer condition** — Admin Members, POS payment, Orders and LoyaltyService continue to use the Benefits boundary with no BusinessConfig Loyalty read fallback.
4. **Dedicated persistence condition** — the new Benefits-owned policy row exists, has been backfilled, and is zero-diff against the current BrandConfig policy.
5. **Write parity condition** — the deployed Benefits writer updates the dedicated Benefits row and transitional copies atomically, and mismatch telemetry/reporting is zero for the agreed observation period.
6. **Rollback condition** — the oldest application version allowed for rollback no longer relies on `BusinessConfig -> BrandConfig` propagation for Loyalty updates.
7. **Migration authorization condition** — the user has explicitly approved the Prisma migration that replaces the database trigger function.

Only then is it safe to make unrelated BusinessConfig writes incapable of changing Loyalty policy.

## 5. Historical Admin contract contraction PR

This was the first behavior-changing PR and did **not** need a Prisma migration. The later Phase D acceptance method was explicitly changed to targeted direct production tests rather than waiting for a business-day observation window.

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

Phase A was implemented after explicit Prisma/migration authorization. The combined Phase D final contraction likewise received explicit authorization on 2026-09-01 before its trigger/schema migration was created.

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

Implementation status: **implemented locally** after production parity was rechecked: the three singleton copies are currently zero-diff and the API logs show no `loyalty_policy_shadow_mismatch` events in the inspected last-24-hour window.

After zero-diff observation:

- `getLoyaltyPolicySnapshot()` returns LoyaltyProgramPolicy while continuing to compare BrandConfig for parity telemetry;
- `getLoyaltyPolicySnapshotWithTx(tx)` returns LoyaltyProgramPolicy through the same `tx` while comparing BrandConfig through that same transaction client;
- `getLoyaltyPolicySettings()` returns LoyaltyProgramPolicy while keeping BrandConfig as a shadow/rollback copy;
- partial policy writes merge the patch against LoyaltyProgramPolicy rather than BrandConfig, preventing stale transitional values from being replayed into the dedicated fact source;
- public API contracts remain unchanged;
- writes continue to LoyaltyProgramPolicy + BusinessConfig + BrandConfig temporarily for rollback safety.

The previous passive business-cycle wait is no longer a Phase D gate. Before contraction, use direct production parity queries plus targeted end-to-end actions so the relevant paths are exercised immediately rather than waiting for organic traffic.

### Phase D — Final Loyalty persistence contraction

Implementation status: **complete in production and closed out.** PR #2095 passed GitHub Actions and was merged; the destructive contraction migration was applied successfully in production; direct targeted verification completed on 2026-09-01 America/Toronto.

The user-approved Phase D target combines the old D/E/F/G end state:

1. replace `syncBusinessConfigToCanonicalConfig()` so its BrandConfig insert/upsert contains no Loyalty fields while preserving every non-Loyalty Brand/Store synchronization behavior;
2. make the Benefits reader/settings/transaction paths read only `LoyaltyProgramPolicy`;
3. make the Benefits writer merge and write only `LoyaltyProgramPolicy`; remove BusinessConfig and BrandConfig Loyalty writes and the parity/shadow helper;
4. drop the ten Loyalty columns from both BrandConfig and BusinessConfig only after the replacement trigger function no longer references them;
5. keep `LoyaltyProgramPolicy` unchanged as the sole policy persistence model;
6. make the architecture scanner fail CI if Loyalty application code regains BrandConfig/BusinessConfig policy reads or writes;
7. keep the compatibility-register entry active until the destructive migration is deployed and direct verification is clean, then move it to `closed` in the same closeout that makes that terminal state CI-enforced.

The application, schema, migration, CI validation, production deployment, and direct verification are all complete. The compatibility entry is therefore closed in this follow-up; production rollback is forward-fix only after the destructive contraction.

The final migration must fail closed before destructive DDL if any of the ten current values differ across `LoyaltyProgramPolicy(id=1)`, `BrandConfig(id=1)`, and `BusinessConfig(id=1)`. It must replace the trigger function before dropping either table's Loyalty columns. Do not invent values or recreate removed columns during rollback.

Deployment ordering is part of the contraction safety boundary. The current Docker runtime does not automatically execute `prisma migrate deploy`, and an old Phase C API cannot safely remain serving after the duplicated columns are dropped. Build the new image first, briefly stop the old API/worker, run the authorized migration using the new image, then start the new services. Do not perform an Admin Loyalty policy write with the new application before the contraction migration has completed, because the new writer intentionally updates only `LoyaltyProgramPolicy` and the migration will correctly fail closed if the retired copies drift during that window.

## 8. Direct verification checklist for Phase D

Do not wait for a natural order or a full business cycle. After deploying the complete Phase D contraction, actively exercise these paths:

1. query the canonical `LoyaltyProgramPolicy(id=1)` values and record them;
2. open Admin Members Loyalty settings, change one intentionally chosen policy field through `/admin/benefits/loyalty-policy`, reload it, and verify only `LoyaltyProgramPolicy` stores the new value;
3. open POS payment and confirm the Loyalty policy loads successfully;
4. place or quote a Web order that exercises points redemption conversion and verify the configured `redeemDollarPerPoint` is honored; pure-points payment is suitable and does not require waiting for an organic order;
5. open the public membership rules surface and verify earn/referral/tier values match the canonical policy;
6. save an unrelated Brand/Store setting through its normal staff contract and verify the Loyalty policy is unchanged while the intended non-Loyalty BrandConfig/StoreConfig field changes correctly;
7. query PostgreSQL metadata and verify `syncBusinessConfigToCanonicalConfig()` contains none of the ten Loyalty field names and BrandConfig/BusinessConfig no longer expose those columns;
8. inspect application logs around the test actions for Benefits/Admin/POS/Orders/Brand-Store errors.

Observed production results on 2026-09-01 America/Toronto:

- migration `20260901235900_contract_loyalty_policy_storage` applied successfully;
- PostgreSQL metadata reported zero remaining Loyalty columns on `BrandConfig`/`BusinessConfig` and a Loyalty-free `syncBusinessConfigToCanonicalConfig()`;
- Admin Loyalty policy was intentionally changed and restored through two `PATCH /admin/benefits/loyalty-policy` requests, both `200`; the final canonical row matches the original policy values;
- POS loaded `GET /pos/loyalty-policy` with `200`;
- Web created pure-points order `cawqbhc6m7hnh1zp7czbzkr0y` with `loyaltyRedeemCents=749`, `paymentTotalCents=0`, `externalCents=0`, and no `PaymentTransaction`; full refund returned `201` and the Loyalty ledger contains exact `-7,490,000` / `+7,490,000` micro-point redemption/reversal entries;
- public membership rules loaded through `GET /public/membership/rules` with `200`;
- Store hours were changed and restored through the canonical staff Store route with `200` while `LoyaltyProgramPolicy.updatedAt` remained unchanged after the Loyalty restore;
- the inspected test window contained no HTTP 5xx, Prisma missing-column/schema-mismatch, or equivalent contraction errors.

This direct test set replaces passive observation as the acceptance method for this contraction.

## 9. Rollback principles

- Never rewrite Loyalty ledger history during policy migration.
- Do not reinterpret historical order redemption amounts using a newer policy.
- Before the destructive database contraction is deployed, rollback may target the Phase C dedicated-read release because the duplicate columns still exist; do not roll back to an older BrandConfig-canonical reader.
- After the trigger split and column drop, rollback is forward-fix only and must target an application version that uses `LoyaltyProgramPolicy` as the canonical source.
- Do not recreate dropped columns from guessed defaults.

## 10. Exit criteria

`benefits.business-config-loyalty-policy.v1` is **closed**. All exit criteria are satisfied:

- old Admin Business Loyalty request fields are gone;
- old Admin Business Loyalty response fields are gone;
- Web old-route Loyalty consumers are zero and CI-enforced;
- runtime Benefits readers use only LoyaltyProgramPolicy;
- Benefits writer uses only LoyaltyProgramPolicy;
- BusinessConfig trigger contains no Loyalty fields;
- BrandConfig and BusinessConfig contain no Loyalty columns;
- no active `BusinessConfig` Loyalty read/write/fallback remains;
- direct post-deployment verification and pre-contraction parity evidence are clean;
- the compatibility register records the entry under `closed`, and the architecture scanner fails if this persistence compatibility is reactivated.
