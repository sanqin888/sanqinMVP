# Uber integration state migration runbook

Suggested migration name: `harden_uber_integration_state_models`.

`storeId` on Uber menu configuration, publication, reconciliation, and ops
ticket rows means the **POS store ID**. It is not a tenant or merchant business
ID. The historical value `"default"` is only a legacy single-store sentinel;
new multi-store code must pass a resolved POS store ID and must not infer a
tenant identity from it.

## Compatible rollout order

Do not combine the final destructive cleanup with the application read/write
switch in one release.

1. **Expand and backfill:** add the PostgreSQL enum types and any replacement
   store identifier columns as nullable, add the worker-claim indexes, then
   backfill existing string states and every legacy `storeId = 'default'` row
   from the authoritative Uber-to-POS store mapping. Validate that no unknown
   state or unresolved default row remains.
2. **Switch code:** deploy code that writes enum values and explicit POS store
   IDs, while retaining compatibility reads for the old columns during the
   bounded rollout window. Monitor retry workers and compare old/new values.
3. **Contract later:** only after all application instances run the new code,
   make replacement fields required, remove defaults/compatibility reads, and
   drop old string or legacy identifier fields in a separate migration.

After reviewing the generated SQL and completing the backfill plan, a
maintainer can create the migration locally (the agent does not generate
migration folders):

```sh
pnpm --filter api exec prisma migrate dev --name harden_uber_integration_state_models
```
