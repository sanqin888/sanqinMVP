import type {
  PosCardPaymentActiveReviewItem,
  PosCardPaymentReviewItem,
} from "@/lib/api/pos";

/**
 * The current browser's original Attempt stays pinned even when server limits
 * exclude it. The Store's 10 unresolved and 25 historic slots stay independent.
 */
export function partitionPosCardPaymentReviewQueues(
  activeItems: readonly PosCardPaymentActiveReviewItem[],
  historicItems: readonly PosCardPaymentReviewItem[],
  currentPendingAttemptId: string | null | undefined,
): {
  activeItems: PosCardPaymentActiveReviewItem[];
  historicalItems: PosCardPaymentReviewItem[];
} {
  const visibleActive = activeItems.filter(
    (item) => item.attemptId !== currentPendingAttemptId,
  );
  const reservedIds = new Set(activeItems.map((item) => item.attemptId));
  if (currentPendingAttemptId) reservedIds.add(currentPendingAttemptId);
  return {
    activeItems: visibleActive,
    historicalItems: historicItems.filter(
      (item) => !reservedIds.has(item.attemptId),
    ),
  };
}
