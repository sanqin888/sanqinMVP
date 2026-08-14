"use client";
import { useCallback, useState } from 'react';
import type { OperationPhase } from '../types';
export type RunAction = (key: string, fn: () => Promise<void>, successText: string, shouldRefresh?: boolean) => Promise<void>;
export function useUberMutationState(refresh: () => Promise<unknown>) {
  const [operations, setOperations] = useState<Record<string, OperationPhase>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback<RunAction>(async (key, fn, successText, shouldRefresh = true) => {
    setOperations((state) => ({ ...state, [key]: 'QUEUED' })); setActionError(null); setActionMessage(null);
    await Promise.resolve(); setOperations((state) => ({ ...state, [key]: 'PROCESSING' }));
    try { await fn(); setOperations((state) => ({ ...state, [key]: successText.includes('等待 Uber') ? 'WAITING_WEBHOOK' : 'COMPLETED' })); setActionMessage(successText); if (shouldRefresh) await refresh(); }
    catch (error) { setOperations((state) => ({ ...state, [key]: 'RETRYABLE_FAILED' })); setActionError(error instanceof Error ? error.message : '操作失败'); }
  }, [refresh]);
  const actionLoading = Object.fromEntries(Object.entries(operations).map(([key, value]) => [key, value === 'QUEUED' || value === 'PROCESSING']));
  return { operations, actionLoading, actionMessage, actionError, setActionError, runAction };
}
