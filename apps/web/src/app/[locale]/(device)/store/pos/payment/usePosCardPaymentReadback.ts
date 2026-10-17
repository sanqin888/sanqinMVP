"use client";

import { useEffect } from "react";
import { ApiError } from "@/lib/api/client";
import {
  fetchPosCardPaymentReviewAttempt,
  type PosCardPaymentResult,
} from "@/lib/api/pos";
import { needsPosCardPaymentReadback } from "@/lib/pos-card-payment-realtime";

/**
 * Secondary, read-only delivery path when POS WebSocket is late, absent or
 * disconnected. This hook never calls start/recover/recheck/resume/cancel.
 * The owning page alone applies same-Attempt, monotonic financial snapshots.
 */
export function usePosCardPaymentReadback({
  enabled,
  attemptId,
  latestSnapshot,
  onSnapshot,
}: {
  enabled: boolean;
  attemptId?: string;
  latestSnapshot: PosCardPaymentResult | null;
  onSnapshot: (snapshot: PosCardPaymentResult) => void;
}): void {
  const needsReadback = needsPosCardPaymentReadback(latestSnapshot);

  useEffect(() => {
    if (!enabled || !attemptId || !needsReadback) return;

    let disposed = false;
    let inFlight = false;
    let warned = false;
    const readOriginalAttempt = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await fetchPosCardPaymentReviewAttempt(attemptId);
        if (!disposed) onSnapshot(snapshot);
      } catch (err) {
        // The first GET may race with /start persisting the original Attempt.
        // A failed read never changes payment finality or allows a second Sale.
        if (
          !disposed &&
          !warned &&
          !(err instanceof ApiError && err.status === 404)
        ) {
          warned = true;
          console.warn("POS original card Attempt readback unavailable:", err);
        }
      } finally {
        inFlight = false;
      }
    };

    void readOriginalAttempt();
    const interval = window.setInterval(() => void readOriginalAttempt(), 4000);
    const onFocus = () => void readOriginalAttempt();
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, attemptId, needsReadback, onSnapshot]);
}
