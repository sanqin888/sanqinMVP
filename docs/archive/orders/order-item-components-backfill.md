# Historical order item component migration

## Status

- `compat_id`: `orders.order-item-components.v1`
- status: completed / contracted
- completed: 2026-08-30
- old compatibility source: Orders legacy `OrderItem.optionsJson`, including current `MenuOptionTemplateChoice.targetItemStableId` lookup for historical selectable-combo reconstruction.
- canonical historical source: Orders immutable `OrderItem.componentsJson`.

The production backfill and manual adjudication are complete. The final dry-run before contraction reported:

```text
scannedOrderItems: 3311
alreadyBackfilled: 400
notCandidates: 2911
candidates: 0
safe: 0
unresolved: 0
currentMappingTargetCount: 0
```

All historical order items that require component-level interpretation now carry an immutable component snapshot. The compatibility exit criteria are therefore satisfied for this historical set.

## Contraction

The contraction removes the obsolete read-time reconstruction paths:

- Reports no longer query current menu-option target mappings when an order item has no component snapshot. Top-item reporting uses `componentsJson` when present and otherwise treats the order item as a direct item.
- Label planning no longer expands `optionsJson.targetItemStableId` when an order item has no component snapshot. Component-based fulfillment uses `componentsJson`; non-component items remain direct items with their original option snapshot.
- The one-time historical backfill planner, CLI, and planner tests are removed after successful completion.

This prevents historical reporting or fulfillment behavior from being re-derived from mutable current catalog state.

## Retained contracts

This contraction does **not** remove or repurpose persisted fields:

- `OrderItem.optionsJson` remains the immutable order-time option/pricing snapshot and is still used for display and option price deltas.
- `OrderItem.componentsJson` remains the immutable actual-component snapshot used for fulfillment, item-level sales quantity, labels, and historical display.
- `MenuOptionTemplateChoice.targetItemStableId` remains the live catalog relationship used when creating new selectable-combo snapshots.
- `MenuItemComponent` remains the live catalog configuration for fixed-combo composition.

Historical soft-deleted catalog rows are retained for auditability; this change does not physically delete historical menu or option records.

## Rollback

If a regression is discovered after contraction, restore the removed compatibility reader in code for the affected consumer. Do not erase or regenerate existing `componentsJson` snapshots from the current catalog.
