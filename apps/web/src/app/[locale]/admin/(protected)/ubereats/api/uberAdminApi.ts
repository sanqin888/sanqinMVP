import { apiFetch } from '@/lib/api/client';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, OAuthStoresResponse, ReconciliationReport, SummaryResponse, Ticket, UberMenuDraftDiffResponse, UberMenuDraftResponse, PendingOrder } from '../types';

export const uberApiFetch = apiFetch;

export async function loadConnectionStores(signal: AbortSignal) {
  const [connectUrl, connection] = await Promise.all([
    apiFetch<OAuthConnectUrlResponse>('/integrations/ubereats/oauth/connect-url', { signal }),
    apiFetch<OAuthConnectionResponse>('/integrations/ubereats/oauth/connection', { signal }),
  ]);
  const response = await apiFetch<OAuthStoresResponse>(`/integrations/ubereats/oauth/stores?merchantUberUserId=${encodeURIComponent(connection.merchantUberUserId)}`, { signal });
  return { connectUrl, connection, stores: response.stores ?? [] };
}

export function loadMenuDraft(storeId: string, signal: AbortSignal) {
  return Promise.all([
    apiFetch<UberMenuDraftResponse>(`/integrations/ubereats/menu/draft?storeId=${encodeURIComponent(storeId)}`, { signal }),
    apiFetch<UberMenuDraftDiffResponse>(`/integrations/ubereats/menu/draft/diff?storeId=${encodeURIComponent(storeId)}`, { signal }),
  ]).then(([draft, diff]) => ({ draft, diff }));
}

export const loadPendingOrders = (signal: AbortSignal) => apiFetch<{ items: PendingOrder[] }>('/integrations/ubereats/orders/pending?limit=25', { signal }).then((result) => result.items);
export const loadReconciliationReports = (signal: AbortSignal) => apiFetch<{ items: ReconciliationReport[] }>('/integrations/ubereats/reports/reconciliation?limit=20', { signal }).then((result) => result.items);
export const loadTickets = (query: string, signal: AbortSignal) => apiFetch<{ items: Ticket[] }>(`/integrations/ubereats/ops/tickets?${query}`, { signal }).then((result) => result.items);
export const loadSummary = (path: string) => apiFetch<SummaryResponse>(path);
export const publishMenu = apiFetch;
