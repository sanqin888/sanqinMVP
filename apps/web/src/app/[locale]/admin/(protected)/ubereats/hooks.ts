"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from '@/lib/api/client';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, OAuthStoresResponse, PendingOrder, PendingOrdersResponse, ReconciliationReport, ReconciliationResponse, Ticket, TicketsResponse, TicketStatus, UberMenuDraftDiffResponse, UberMenuDraftResponse } from './types';

export function useUberAdminData(ticketStoreFilter: string, ticketStatusFilter: TicketStatus | '') {
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<OAuthConnectUrlResponse | null>(null);
  const [connection, setConnection] = useState<OAuthConnectionResponse | null>(null);
  const [stores, setStores] = useState<OAuthStoresResponse['stores']>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reports, setReports] = useState<ReconciliationReport[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);
    const query = ticketStoreFilter || ticketStatusFilter ? `?${new URLSearchParams({ ...(ticketStoreFilter ? { storeId: ticketStoreFilter } : {}), ...(ticketStatusFilter ? { status: ticketStatusFilter } : {}) }).toString()}` : '';
    const tasks = await Promise.allSettled([
      apiFetch<OAuthConnectUrlResponse>('/integrations/ubereats/oauth/connect-url'),
      apiFetch<OAuthConnectionResponse>('/integrations/ubereats/oauth/connection'),
      apiFetch<TicketsResponse>(`/integrations/ubereats/ops/tickets${query}`),
      apiFetch<ReconciliationResponse>('/integrations/ubereats/reports/reconciliation?limit=20'),
      apiFetch<PendingOrdersResponse>('/integrations/ubereats/orders/pending'),
    ]);
    const errors: string[] = [];
    const [connect, conn, ticketRes, reportRes, orderRes] = tasks;
    if (connect.status === 'fulfilled') setConnectUrl(connect.value); else errors.push('connect-url');
    if (conn.status === 'fulfilled') {
      setConnection(conn.value);
      try {
        const storeRes = await apiFetch<OAuthStoresResponse>(`/integrations/ubereats/oauth/stores?merchantUberUserId=${encodeURIComponent(conn.value.merchantUberUserId)}`);
        setStores(storeRes.stores ?? []);
      } catch { errors.push('oauth stores'); }
    } else { setConnection(null); setStores([]); }
    if (ticketRes.status === 'fulfilled') setTickets(ticketRes.value.items); else errors.push('tickets');
    if (reportRes.status === 'fulfilled') setReports(reportRes.value.items); else errors.push('reports');
    if (orderRes.status === 'fulfilled') setPendingOrders(orderRes.value.items); else errors.push('orders');
    if (errors.length) setGlobalError(`部分区块加载失败：${errors.join('、')}，其余模块仍可使用。`);
    setLoading(false);
  }, [ticketStatusFilter, ticketStoreFilter]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  return { loading, globalError, connectUrl, connection, stores, pendingOrders, tickets, reports, loadAll };
}

export function useUberMenuDraft(storeId: string, reportError: (message: string) => void) {
  const [menuDraft, setMenuDraft] = useState<UberMenuDraftResponse | null>(null);
  const [menuDiff, setMenuDiff] = useState<UberMenuDraftDiffResponse | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuFetchedAt, setMenuFetchedAt] = useState<string | null>(null);
  const loadMenuDraft = useCallback(async (targetStoreId: string, options?: { keepSelection?: boolean }) => {
    if (!targetStoreId) { setMenuDraft(null); setMenuDiff(null); return; }
    setMenuLoading(true);
    try {
      const [draft, diff] = await Promise.all([
        apiFetch<UberMenuDraftResponse>(`/integrations/ubereats/menu/draft?storeId=${encodeURIComponent(targetStoreId)}`),
        apiFetch<UberMenuDraftDiffResponse>(`/integrations/ubereats/menu/draft/diff?storeId=${encodeURIComponent(targetStoreId)}`),
      ]);
      setMenuDraft(draft); setMenuDiff(diff); setMenuFetchedAt(new Date().toISOString());
      void options;
    } catch (error) { reportError(error instanceof Error ? error.message : '菜单草稿加载失败'); }
    finally { setMenuLoading(false); }
  }, [reportError]);
  useEffect(() => { if (storeId) void loadMenuDraft(storeId); else { setMenuDraft(null); setMenuDiff(null); } }, [storeId, loadMenuDraft]);
  return { menuDraft, menuDiff, menuLoading, menuFetchedAt, loadMenuDraft };
}

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
