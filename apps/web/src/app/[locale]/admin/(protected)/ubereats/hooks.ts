"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from '@/lib/api/client';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, OAuthStoresResponse, OperationPhase, PendingOrder, ReconciliationReport, ResourceState, SummaryResponse, Ticket, TicketStatus, UberMenuDraftDiffResponse, UberMenuDraftResponse } from './types';

const STALE_MS = 30_000;

function useVisibleResource<T>(enabled: boolean, loader: (signal: AbortSignal) => Promise<T>, initial: T, staleMs = STALE_MS) {
  const [data, setData] = useState(initial);
  const [state, setState] = useState<ResourceState>({ loading: false, error: null, lastUpdated: null });
  const fetchedAt = useRef(0);
  const sequence = useRef(0);
  const load = useCallback(async (force = false) => {
    if (!enabled || (!force && Date.now() - fetchedAt.current < staleMs)) return;
    const request = ++sequence.current;
    const controller = new AbortController();
    setState((value) => ({ ...value, loading: true, error: null }));
    try {
      const value = await loader(controller.signal);
      if (request !== sequence.current) return;
      fetchedAt.current = Date.now();
      setData(value);
      setState({ loading: false, error: null, lastUpdated: new Date().toISOString() });
    } catch (error) {
      if (request !== sequence.current || controller.signal.aborted) return;
      setState((value) => ({ ...value, loading: false, error: error instanceof Error ? error.message : '加载失败' }));
    }
    controller.abort();
  }, [enabled, loader, staleMs]);
  useEffect(() => {
    if (!enabled) { sequence.current += 1; return; }
    void load();
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { sequence.current += 1; window.removeEventListener('focus', onVisibility); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, load]);
  return { data, ...state, retry: () => load(true), refresh: load };
}

export function useUberConnectionStores(visible: boolean) {
  const loader = useCallback(async (signal: AbortSignal) => {
    const [connectUrl, connection] = await Promise.all([
      apiFetch<OAuthConnectUrlResponse>('/integrations/ubereats/oauth/connect-url', { signal }),
      apiFetch<OAuthConnectionResponse>('/integrations/ubereats/oauth/connection', { signal }),
    ]);
    const stores = await apiFetch<OAuthStoresResponse>(`/integrations/ubereats/oauth/stores?merchantUberUserId=${encodeURIComponent(connection.merchantUberUserId)}`, { signal });
    return { connectUrl, connection, stores: stores.stores ?? [] };
  }, []);
  return useVisibleResource(visible, loader, { connectUrl: null, connection: null, stores: [] } as { connectUrl: OAuthConnectUrlResponse | null; connection: OAuthConnectionResponse | null; stores: OAuthStoresResponse['stores'] });
}

function useSummaryList<T>(visible: boolean, summaryPath: string, listPath: string, initial: T[]) {
  const [revision, setRevision] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => apiFetch<{ items: T[] }>(listPath, { signal }).then((r) => r.items), [listPath]);
  const resource = useVisibleResource(visible, loader, initial);
  const retry = resource.retry;
  const poll = useCallback(async () => {
    if (!visible || document.visibilityState !== 'visible') return;
    const summary = await apiFetch<SummaryResponse>(summaryPath);
    const next = summary.updatedAt ?? `${summary.count}`;
    if (revision !== null && next !== revision) await retry();
    setRevision(next);
  }, [retry, revision, summaryPath, visible]);
  useUberPolling(poll, STALE_MS, visible);
  return { ...resource, summaryRevision: revision };
}

export function useUberOrders(visible: boolean) {
  return useSummaryList<PendingOrder>(visible, '/integrations/ubereats/orders/pending/summary', '/integrations/ubereats/orders/pending?limit=25', []);
}
export function useUberOperations(visible: boolean, storeId: string, status: TicketStatus | '') {
  const query = new URLSearchParams({ limit: '25', ...(storeId ? { storeId } : {}), ...(status ? { status } : {}) }).toString();
  return useSummaryList<Ticket>(visible, `/integrations/ubereats/ops/tickets/summary?${query}`, `/integrations/ubereats/ops/tickets?${query}`, []);
}
export function useUberReports(visible: boolean) {
  return useSummaryList<ReconciliationReport>(visible, '/integrations/ubereats/reports/reconciliation/summary', '/integrations/ubereats/reports/reconciliation?limit=20', []);
}

export function useUberMenuDraft(storeId: string, visible: boolean) {
  const loader = useCallback(async (signal: AbortSignal) => {
    if (!storeId) return { draft: null, diff: null };
    const [draft, diff] = await Promise.all([
      apiFetch<UberMenuDraftResponse>(`/integrations/ubereats/menu/draft?storeId=${encodeURIComponent(storeId)}`, { signal }),
      apiFetch<UberMenuDraftDiffResponse>(`/integrations/ubereats/menu/draft/diff?storeId=${encodeURIComponent(storeId)}`, { signal }),
    ]);
    return { draft, diff };
  }, [storeId]);
  const resource = useVisibleResource(visible && Boolean(storeId), loader, { draft: null, diff: null } as { draft: UberMenuDraftResponse | null; diff: UberMenuDraftDiffResponse | null });
  const loadMenuDraft = (targetStoreId?: string, options?: { keepSelection?: boolean }) => {
    void targetStoreId; void options;
    return resource.retry();
  };
  return { menuDraft: resource.data.draft, menuDiff: resource.data.diff, menuLoading: resource.loading, menuFetchedAt: resource.lastUpdated, menuError: resource.error, loadMenuDraft };
}

export function useUberMutationState(refresh: () => Promise<unknown>) {
  const [operations, setOperations] = useState<Record<string, OperationPhase>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback(async (key: string, fn: () => Promise<void>, successText: string, shouldRefresh = true) => {
    setOperations((s) => ({ ...s, [key]: 'QUEUED' })); setActionError(null); setActionMessage(null);
    await Promise.resolve(); setOperations((s) => ({ ...s, [key]: 'PROCESSING' }));
    try { await fn(); setOperations((s) => ({ ...s, [key]: successText.includes('等待 Uber') ? 'WAITING_WEBHOOK' : 'COMPLETED' })); setActionMessage(successText); if (shouldRefresh) await refresh(); }
    catch (error) { setOperations((s) => ({ ...s, [key]: 'RETRYABLE_FAILED' })); setActionError(error instanceof Error ? error.message : '操作失败'); }
  }, [refresh]);
  const actionLoading = Object.fromEntries(Object.entries(operations).map(([key, value]) => [key, value === 'QUEUED' || value === 'PROCESSING']));
  return { operations, actionLoading, actionMessage, actionError, setActionError, runAction };
}

export function useUberPolling(task: () => Promise<void>, intervalMs: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const tick = () => { if (running || document.visibilityState !== 'visible') return; running = true; void task().finally(() => { running = false; }); };
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, task]);
}
