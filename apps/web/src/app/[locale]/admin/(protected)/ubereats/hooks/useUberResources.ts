"use client";
import { useCallback, useState } from 'react';
import { loadConnectionStores, loadPendingOrders, loadReconciliationReports, loadSummary, loadTickets } from '../api/uberAdminApi';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, OAuthStoresResponse, TicketStatus } from '../types';
import { UBER_RESOURCE_STALE_MS, useVisibleResource } from './useVisibleResource';
import { useUberPolling } from './useUberPolling';

export function useUberConnectionStores(visible: boolean) {
  const loader = useCallback((signal: AbortSignal) => loadConnectionStores(signal), []);
  return useVisibleResource(visible, loader, { connectUrl: null, connection: null, stores: [] } as { connectUrl: OAuthConnectUrlResponse | null; connection: OAuthConnectionResponse | null; stores: OAuthStoresResponse['stores'] });
}

function useSummaryList<T>(visible: boolean, summaryPath: string, loader: (signal: AbortSignal) => Promise<T[]>) {
  const [revision, setRevision] = useState<string | null>(null);
  const resource = useVisibleResource(visible, loader, [] as T[]);
  const retry = resource.retry;
  const poll = useCallback(async () => {
    if (!visible || document.visibilityState !== 'visible') return;
    const summary = await loadSummary(summaryPath);
    const next = summary.updatedAt ?? `${summary.count}`;
    if (revision !== null && next !== revision) await retry();
    setRevision(next);
  }, [retry, revision, summaryPath, visible]);
  useUberPolling(poll, UBER_RESOURCE_STALE_MS, visible);
  return { ...resource, summaryRevision: revision };
}
export function useUberOrders(visible: boolean) {
  const loader = useCallback(loadPendingOrders, []);
  return useSummaryList(visible, '/integrations/ubereats/orders/pending/summary', loader);
}
export function useUberOperations(visible: boolean, storeId: string, status: TicketStatus | '') {
  const query = new URLSearchParams({ limit: '25', ...(storeId ? { storeId } : {}), ...(status ? { status } : {}) }).toString();
  const loader = useCallback((signal: AbortSignal) => loadTickets(query, signal), [query]);
  return useSummaryList(visible, `/integrations/ubereats/ops/tickets/summary?${query}`, loader);
}
export function useUberReports(visible: boolean) {
  const loader = useCallback(loadReconciliationReports, []);
  return useSummaryList(visible, '/integrations/ubereats/reports/reconciliation/summary', loader);
}
