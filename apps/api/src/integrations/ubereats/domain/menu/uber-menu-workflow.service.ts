type MenuSnapshot = {
  categories: Array<{ stableId: string; name: string; sortOrder: number }>;
  items: Array<{
    stableId: string;
    categoryStableId: string;
    name: string;
    priceCents: number;
    isAvailable: boolean;
  }>;
};
type AvailabilityOverride = { stableId: string; isAvailable: boolean };
type ModifierBinding = {
  parentOptionStableId: string;
  childGroupStableId: string;
  isBound: boolean;
};

/** Applies channel overrides without allowing persistence rows to leak into the graph. */
export function mergeMenuAvailability(
  snapshot: MenuSnapshot,
  configs: readonly AvailabilityOverride[],
): MenuSnapshot {
  const byId = new Map(configs.map((config) => [config.stableId, config]));
  return {
    categories: snapshot.categories.map((category) => ({ ...category })),
    items: snapshot.items.map((item) => ({
      ...item,
      isAvailable:
        item.isAvailable && (byId.get(item.stableId)?.isAvailable ?? true),
    })),
  };
}

export function validateModifierBindings(
  bindings: readonly ModifierBinding[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const binding of bindings.filter((value) => value.isBound)) {
    if (binding.parentOptionStableId === binding.childGroupStableId)
      errors.push(
        `modifier binding cannot reference itself: ${binding.parentOptionStableId}`,
      );
    const key = `${binding.parentOptionStableId}:${binding.childGroupStableId}`;
    if (seen.has(key)) errors.push(`duplicate modifier binding: ${key}`);
    seen.add(key);
  }
  return errors;
}

export type MenuPayloadDecision =
  | { kind: 'skip'; reason: 'UNCHANGED' }
  | { kind: 'upload'; payloadHash: string };
export function decideMenuPayload(
  payloadHash: string,
  lastPublishedHash: string | null,
): MenuPayloadDecision {
  return payloadHash === lastPublishedHash
    ? { kind: 'skip', reason: 'UNCHANGED' }
    : { kind: 'upload', payloadHash };
}
