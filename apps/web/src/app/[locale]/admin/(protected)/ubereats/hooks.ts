"use client";

import { useCallback, useEffect, useState } from "react";

export function useUberMutationState(refresh: () => Promise<void>) {
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback(
    async (
      key: string,
      fn: () => Promise<void>,
      successText: string,
      shouldRefresh = true,
    ) => {
      setActionError(null);
      setActionMessage(null);
      setActionLoading((state) => ({ ...state, [key]: true }));
      try {
        await fn();
        setActionMessage(successText);
        if (shouldRefresh) await refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "操作失败");
      } finally {
        setActionLoading((state) => ({ ...state, [key]: false }));
      }
    },
    [refresh],
  );
  return {
    actionLoading,
    actionMessage,
    actionError,
    setActionError,
    runAction,
  };
}

export function useUberPolling(
  task: () => Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const timer = window.setInterval(() => {
      if (running) return;
      running = true;
      void task().finally(() => {
        running = false;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, task]);
}
