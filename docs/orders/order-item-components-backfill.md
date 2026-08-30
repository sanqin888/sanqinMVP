# Historical order item component backfill

## Compatibility registration

- `compat_id`: `orders.order-item-components.v1`
- `old_owner`: Orders legacy `OrderItem.optionsJson`, with selectable-combo target resolution falling back to the current `MenuOptionTemplateChoice.targetItemStableId` mapping when old snapshots did not contain a target stable ID.
- `new_owner`: Orders immutable `OrderItem.componentsJson` component snapshot.
- `dual_write_or_read paths`: New orders write `componentsJson` at order creation. Historical rows without a component snapshot continue to use the existing legacy read behavior. The backfill only populates rows where `componentsJson` is still database NULL.
- `parity metric`: dry-run candidate/SAFE/UNRESOLVED counts, component counts, child-option-group assignment counts, mapping-source counts, and unresolved-reason counts. Historical component quantities must agree with the legacy selectable-combo target count before read contraction.
- `rollback/cutback plan`: do not apply before dry-run review. If a post-apply discrepancy is found, stop further writes and cut reads back to the retained legacy path for affected historical rows; do not automatically erase or rewrite historical snapshots.
- `exit criteria`: all automatically provable historical rows are backfilled, every remaining UNRESOLVED row is explicitly adjudicated, and legacy fallback usage reaches zero for the relevant historical set before any contraction.
- `removal task/PR`: a separate, explicitly authorized contraction may remove the legacy current-menu target-mapping fallback after parity and observation are complete.
- `deadline/business milestone`: complete before the Orders historical-read compatibility path is removed during modularization.

## Safety model

The backfill command is intentionally conservative and idempotent.

- Default mode is dry-run and performs no writes.
- `componentsJson` that is already non-NULL is never overwritten.
- A historical choice-level `targetItemStableId` is authoritative when present.
- For older choices without a snapshotted target, the current target mapping is accepted only when that option group is still bound to the historical parent menu item.
- Historical component names come from the order-time option snapshot rather than the current menu item name.
- Non-target option groups are assigned to a component only when current menu bindings identify exactly one selected target item as the owner.
- If the same target item appears more than once, repeated child-option groups are accepted only when every occurrence has a semantically identical selection. Different A/B child selections are reported as unresolved instead of guessed.
- Missing targets, unowned groups, ambiguous owners, malformed candidate snapshots, and repeated-target ambiguity are reported as `UNRESOLVED` and are not written.

## Dry-run

After the API image containing this command is deployed, run it inside the API container:

```bash
docker compose exec api node apps/api/dist/orders/tools/backfill-order-item-components.js
```

The command prints a JSON report containing:

- scanned order-item count;
- existing component-snapshot count;
- candidate count;
- `SAFE` and `UNRESOLVED` counts;
- planned component and child-option-group counts;
- snapshot-target versus current-mapping evidence counts;
- warnings and unresolved reasons;
- per-parent-item counts;
- bounded unresolved order samples identified by `orderStableId` and parent product stable ID.

Dry-run does not return internal `OrderItem.id` values in the operator report.

## Apply mode

Apply mode exists for the later explicitly authorized production-write step. Do not run it merely because the command has been deployed.

```bash
docker compose exec api node apps/api/dist/orders/tools/backfill-order-item-components.js \
  --apply \
  --confirm=BACKFILL_ORDER_ITEM_COMPONENTS_V1
```

Apply mode writes only plans classified as `SAFE`, and each update includes a `componentsJson IS NULL` guard. It then re-reads the planned rows and reports `postCheckFilled` and `postCheckMissing`; a non-zero `postCheckMissing` sets a non-zero process exit code so an operator cannot mistake an incomplete apply for success. The operation is retryable: an interrupted or partially completed run can be dry-run again, and already populated rows will be skipped.
