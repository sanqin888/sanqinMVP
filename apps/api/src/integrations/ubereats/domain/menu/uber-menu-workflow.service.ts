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
