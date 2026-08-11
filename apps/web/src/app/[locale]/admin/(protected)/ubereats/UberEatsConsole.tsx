'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUberConnectionStores, useUberMenuDraft, useUberMutationState, useUberOperations, useUberOrders, useUberReports } from './hooks';
import { apiFetch } from '@/lib/api/client';
import { MenuDraftPanel, OAuthConnectionPanel, OperationsTicketsPanel, OrdersPanel, PublishHistoryPanel, ReconciliationPanel, ResourceStatus, StoreMappingPanel } from './components';

import type { DraftNode, DraftTreeKey, ModuleKey, StoreMenuTabKey, TicketStatus, UberDraftCategoryNode, UberDraftGroupNode, UberDryRunResponse } from './types';

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'dashboard', label: '总览 Dashboard' },
  { key: 'auth', label: '接入与授权' },
  { key: 'store-menu', label: '门店与菜单' },
  { key: 'orders-ops', label: '订单与运营' },
  { key: 'reconciliation-tickets', label: '对账与工单' },
];

const UBER_ITEM_DESCRIPTION_MAX_LENGTH = 300;
const STORE_MENU_TABS: Array<{ key: StoreMenuTabKey; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'mapping', label: '菜单映射' },
  { key: 'editor', label: 'Uber 编辑器' },
  { key: 'publish', label: '发布中心' },
];

function safeTime(input?: string | null): string {
  if (!input) return '-';
  return new Date(input).toLocaleString();
}

export function UberEatsConsole() {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [ticketStoreFilter, setTicketStoreFilter] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | ''>('');
  const connectionData = useUberConnectionStores(active === 'dashboard' || active === 'auth' || active === 'store-menu');
  const { connectUrl, connection, stores } = connectionData.data;
  const ordersData = useUberOrders(active === 'orders-ops');
  const operationsData = useUberOperations(active === 'reconciliation-tickets', ticketStoreFilter, ticketStatusFilter);
  const reportsData = useUberReports(active === 'reconciliation-tickets');
  const pendingOrders = ordersData.data;
  const tickets = operationsData.data;
  const reports = reportsData.data;
  const refreshVisible = useCallback(async () => {
    await Promise.all([connectionData.retry(), ordersData.retry(), operationsData.retry(), reportsData.retry()]);
  }, [connectionData, operationsData, ordersData, reportsData]);
  const { operations, actionLoading, actionMessage, actionError, setActionError, runAction } = useUberMutationState(refreshVisible);

  const [integratorStoreId, setIntegratorStoreId] = useState('');
  const [posStoreIdDrafts, setPosStoreIdDrafts] = useState<Record<string, string>>({});
  const [provisionPayload, setProvisionPayload] = useState('{\n  "is_order_manager": true\n}');
  const [storeMenuTab, setStoreMenuTab] = useState<StoreMenuTabKey>('overview');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [taxRateConfirmed, setTaxRateConfirmed] = useState(false);
  const [dryRunSchedule, setDryRunSchedule] = useState<UberDryRunResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<Record<string, unknown>>({});
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(() => new Set());
  const [selectedSourceNodeIds, setSelectedSourceNodeIds] = useState<Set<string> | null>(null);
  const { menuDraft, menuDiff, menuLoading, menuFetchedAt, menuError, loadMenuDraft: loadStoreMenuDraft } = useUberMenuDraft(selectedStoreId, active === 'store-menu');

  useEffect(() => {
    if (!selectedStoreId && stores[0]?.storeId) {
      setSelectedStoreId(stores[0].storeId);
    }
  }, [selectedStoreId, stores]);

  useEffect(() => {
    setExpandedNodeKeys(new Set());
    setSelectedSourceNodeIds(null);
    setTimezoneConfirmed(false);
    setTaxRateConfirmed(false);
    setDryRunSchedule(null);
  }, [selectedStoreId]);

  const provisionedCount = stores.filter((s) => s.isProvisioned).length;
  const draftCategories = useMemo(
    () => menuDraft?.uberDraft.tree.categories ?? [],
    [menuDraft?.uberDraft.tree.categories],
  );
  const publishPreviewItems = useMemo(() => draftCategories.flatMap((category) => category.items), [draftCategories]);
  const missingImageCount = useMemo(() => publishPreviewItems.filter((item) => !item.imageUrl?.trim()).length, [publishPreviewItems]);
  const descriptionWarnings = useMemo(() => publishPreviewItems.flatMap((item) => {
    const description = item.displayDescription?.trim() ?? '';
    if (!description) return [{ item, message: '缺少描述' }];
    if (description.length > UBER_ITEM_DESCRIPTION_MAX_LENGTH) return [{ item, message: `描述过长（${description.length}/${UBER_ITEM_DESCRIPTION_MAX_LENGTH}）` }];
    return [];
  }), [publishPreviewItems]);
  const sourceDraftCategories = useMemo(
    () => menuDraft?.sourceMenu.tree.categories ?? draftCategories,
    [draftCategories, menuDraft?.sourceMenu.tree.categories],
  );
  const toDraftTrees = useCallback((categories: UberDraftCategoryNode[]) => {
    const toGroup = (group: UberDraftGroupNode, source: DraftNode['source']): DraftNode => ({
      id: group.id,
      type: 'group',
      name: group.name,
      sourceStableId: group.id,
      source,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      children: group.options.map((option) => ({
        id: option.id,
        type: 'option',
        name: option.displayName,
        sourceStableId: option.sourceOptionChoiceStableId,
        source,
        priceDeltaCents: option.priceDeltaCents,
        isAvailable: option.isAvailable,
        childGroupIds: option.childGroups.map((childGroup) => childGroup.id),
        children: option.childGroups.map((childGroup) => ({
          id: childGroup.id,
          type: 'group',
          name: childGroup.name,
          sourceStableId: childGroup.id,
          source,
          minSelect: childGroup.minSelect,
          maxSelect: childGroup.maxSelect,
        })),
      })),
    });
    const sourceTree: DraftNode[] = categories.map((category) => ({
      id: `source-${category.id}`,
      type: 'category',
      name: category.name,
      sourceStableId: category.id,
      source: 'SOURCE',
      children: category.items.map((item) => ({
        id: `source-${item.id}`,
        type: 'item',
        name: item.displayName,
        sourceStableId: item.sourceMenuItemStableId,
        source: 'SOURCE',
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
        children: item.groups.map((group) => toGroup(group, 'SOURCE')),
      })),
    }));
    const uberTree: DraftNode[] = categories.map((category) => ({
      id: category.id,
      type: 'category',
      name: category.name,
      sourceStableId: category.id,
      source: 'AUTO-MAPPED',
      children: category.items.map((item) => ({
        id: item.id,
        type: 'item',
        name: item.displayName,
        sourceStableId: item.sourceMenuItemStableId,
        source: 'AUTO-MAPPED',
        status: menuDraft?.dirty ? 'UNPUBLISHED' : undefined,
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
        children: item.groups.map((group) => toGroup(group, 'AUTO-MAPPED')),
      })),
    }));
    return { sourceTree, uberTree };
  }, [menuDraft?.dirty]);
  const sourceMenuTree = useMemo(
    () => toDraftTrees(sourceDraftCategories).sourceTree,
    [sourceDraftCategories, toDraftTrees],
  );
  const uberDraftTree = useMemo(
    () => toDraftTrees(draftCategories).uberTree,
    [draftCategories, toDraftTrees],
  );
  const normalizedUberDraftTree = useMemo(
    () => menuDraft?.uberDraft.treeNodes ?? uberDraftTree,
    [menuDraft?.uberDraft.treeNodes, uberDraftTree],
  );

  const sourceNodeLookup = useMemo(() => {
    const map = new Map<string, DraftNode>();
    const travel = (list: DraftNode[]) => list.forEach((node) => {
      map.set(node.id, node);
      if (node.children?.length) travel(node.children);
    });
    travel(sourceMenuTree);
    return map;
  }, [sourceMenuTree]);

  useEffect(() => {
    if (selectedSourceNodeIds !== null || menuDraft?.storeId !== selectedStoreId || sourceNodeLookup.size === 0) return;
    const allIds = new Set<string>(Array.from(sourceNodeLookup.keys()));
    setSelectedSourceNodeIds(allIds);
  }, [menuDraft?.storeId, selectedSourceNodeIds, selectedStoreId, sourceNodeLookup]);

  const uncheckedSourceNodeIds = useMemo(() => {
    if (selectedSourceNodeIds === null) return new Set<string>();
    const unchecked = new Set<string>();
    sourceNodeLookup.forEach((_node, id) => {
      if (!selectedSourceNodeIds.has(id)) unchecked.add(id);
    });
    return unchecked;
  }, [selectedSourceNodeIds, sourceNodeLookup]);

  const exclusionFilter = useMemo(() => {
    const excludedCategoryIds = new Set<string>();
    const excludedGroupIds = new Set<string>();
    const excludedMenuItemStableIds = new Set<string>();
    const excludedOptionChoiceStableIds = new Set<string>();

    uncheckedSourceNodeIds.forEach((id) => {
      const node = sourceNodeLookup.get(id);
      if (!node) return;
      if (node.type === 'category') {
        if (node.sourceStableId) excludedCategoryIds.add(node.sourceStableId);
        return;
      }
      if (node.type === 'group') {
        excludedGroupIds.add(node.id);
        return;
      }
      if (node.type === 'item') {
        if (node.sourceStableId) excludedMenuItemStableIds.add(node.sourceStableId);
        return;
      }
      if (node.type === 'option' && node.sourceStableId) {
        excludedOptionChoiceStableIds.add(node.sourceStableId);
      }
    });

    return {
      excludedCategoryIds,
      excludedGroupIds,
      excludedMenuItemStableIds,
      excludedOptionChoiceStableIds,
    };
  }, [uncheckedSourceNodeIds, sourceNodeLookup]);

  const filteredUberTree = useMemo(() => {
    const travel = (nodes: DraftNode[]): DraftNode[] => {
      const result: DraftNode[] = [];
      nodes.forEach((node) => {
        if (node.type === 'category' && exclusionFilter.excludedCategoryIds.has(node.id)) return null;
        if (node.type === 'group' && exclusionFilter.excludedGroupIds.has(node.id)) return null;
        if (node.type === 'item' && node.sourceStableId && exclusionFilter.excludedMenuItemStableIds.has(node.sourceStableId)) return null;
        if (node.type === 'option' && node.sourceStableId && exclusionFilter.excludedOptionChoiceStableIds.has(node.sourceStableId)) return null;

        const children = node.children?.length ? travel(node.children) : undefined;
        if ((node.type === 'category' || node.type === 'item' || node.type === 'group') && children && children.length === 0) {
          return null;
        }

        result.push({
          ...node,
          children,
        });
        return null;
      });
      return result;
    };
    return travel(normalizedUberDraftTree);
  }, [normalizedUberDraftTree, exclusionFilter]);

  const allDraftNodes = useMemo(() => {
    const nodes: DraftNode[] = [];
    const travel = (list: DraftNode[]) => list.forEach((node) => {
      nodes.push(node);
      if (node.children?.length) travel(node.children);
    });
    travel(filteredUberTree);
    return nodes;
  }, [filteredUberTree]);

  const selectedNode = allDraftNodes.find((node) => node.id === selectedNodeId) ?? allDraftNodes[0] ?? null;
  useEffect(() => {
    if (!allDraftNodes.length) {
      setSelectedNodeId(null);
      return;
    }
    if (!selectedNodeId || !allDraftNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(allDraftNodes[0].id);
    }
  }, [allDraftNodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedNode) {
      setInspectorDraft({});
      return;
    }
    if (selectedNode.type === 'item') {
      setInspectorDraft({
        displayName: selectedNode.name,
        displayDescription: '',
        priceCents: selectedNode.priceCents ?? 0,
        isAvailable: selectedNode.isAvailable ?? true,
      });
      return;
    }
    if (selectedNode.type === 'group') {
      setInspectorDraft({
        name: selectedNode.name,
        minSelect: selectedNode.minSelect ?? 0,
        maxSelect: selectedNode.maxSelect ?? 1,
        required: (selectedNode.minSelect ?? 0) > 0,
      });
      return;
    }
    if (selectedNode.type === 'option') {
      setInspectorDraft({
        displayName: selectedNode.name,
        priceDeltaCents: selectedNode.priceDeltaCents ?? 0,
        isAvailable: selectedNode.isAvailable ?? true,
      });
      return;
    }
    setInspectorDraft({});
  }, [selectedNode]);
  const selectedStore = stores.find((store) => store.storeId === selectedStoreId);
  const isNodeExpanded = useCallback(
    (treeKey: DraftTreeKey, nodeId: string) => expandedNodeKeys.has(`${treeKey}:${nodeId}`),
    [expandedNodeKeys],
  );
  const toggleNodeExpand = useCallback((treeKey: DraftTreeKey, nodeId: string) => {
    const key = `${treeKey}:${nodeId}`;
    setExpandedNodeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const handleSourceNodeChecked = useCallback((nodeId: string, checked: boolean) => {
    const root = sourceNodeLookup.get(nodeId);
    if (!root) return;
    const descendantIds: string[] = [];
    const travel = (node: DraftNode) => {
      descendantIds.push(node.id);
      node.children?.forEach(travel);
    };
    travel(root);
    setSelectedSourceNodeIds((prev) => {
      const base = new Set(prev ?? []);
      descendantIds.forEach((id) => {
        if (checked) base.add(id);
        else base.delete(id);
      });
      return base;
    });
  }, [sourceNodeLookup]);
  const renderDraftTree = useCallback((treeKey: DraftTreeKey, nodes: DraftNode[], depth = 0) => (
    <ul className={depth === 0 ? 'space-y-2' : 'ml-4 mt-2 space-y-2 border-l border-slate-200 pl-3'}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => setSelectedNodeId(node.id)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm ${selectedNodeId === node.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
          >
            <span className="flex items-center gap-2">
              {node.children?.length ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleNodeExpand(treeKey, node.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    toggleNodeExpand(treeKey, node.id);
                  }}
                >
                  {isNodeExpanded(treeKey, node.id) ? '-' : '+'}
                </span>
              ) : (
                <span className="inline-flex h-5 w-5 items-center justify-center text-xs text-slate-300">·</span>
              )}
              {treeKey === 'source' ? (
                <input
                  type="checkbox"
                  checked={selectedSourceNodeIds?.has(node.id) ?? true}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleSourceNodeChecked(node.id, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : null}
              <span className="mr-2 text-slate-500">{node.type.toUpperCase()}</span>
              {node.name}
            </span>
            <span className="flex items-center gap-1">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{node.source}</span>
              {node.status ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{node.status}</span> : null}
            </span>
          </button>
          {node.children?.length && isNodeExpanded(treeKey, node.id) ? renderDraftTree(treeKey, node.children, depth + 1) : null}
        </li>
      ))}
    </ul>
  ), [handleSourceNodeChecked, isNodeExpanded, selectedNodeId, selectedSourceNodeIds, toggleNodeExpand]);

  const selectedNodeWarnings = useMemo(
    () => menuDraft?.mappingWarnings.filter((warning) => selectedNode ? warning.sourceStableId === selectedNode.id || warning.path.includes(selectedNode.id) : true) ?? [],
    [menuDraft?.mappingWarnings, selectedNode],
  );
  const blockingValidationIssues = menuDraft?.validation.errors ?? [];
  const businessTimezone = menuDraft?.serviceAvailabilityTimezone ?? null;
  const uberTimezone = selectedStore?.timezone?.trim() || null;
  const timezoneMismatch = Boolean(businessTimezone && uberTimezone && businessTimezone !== uberTimezone);
  const formalPublishDisabled = blockingValidationIssues.length > 0 || timezoneMismatch || !timezoneConfirmed || !taxRateConfirmed;

  const selectedNodeEdgeInfo = useMemo(
    () => (menuDraft?.uberDraft.edges ?? []).filter((edge) => edge.from === selectedNode?.id || edge.to === selectedNode?.id),
    [menuDraft?.uberDraft.edges, selectedNode?.id],
  );
  const publishFilterPayload = useMemo(
    () => ({
      excludedCategoryIds: Array.from(exclusionFilter.excludedCategoryIds),
      excludedGroupIds: Array.from(exclusionFilter.excludedGroupIds),
      excludedMenuItemStableIds: Array.from(exclusionFilter.excludedMenuItemStableIds),
      excludedOptionChoiceStableIds: Array.from(exclusionFilter.excludedOptionChoiceStableIds),
    }),
    [exclusionFilter],
  );

  const saveSelectedNode = useCallback(async () => {
    if (!selectedNode || !selectedStoreId) return;
    if (selectedNode.type === 'item') {
      await apiFetch(`/integrations/ubereats/menu/draft/items/${encodeURIComponent(selectedNode.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          displayName: inspectorDraft.displayName,
          displayDescription: inspectorDraft.displayDescription,
          priceCents: Number(inspectorDraft.priceCents ?? 0),
          isAvailable: Boolean(inspectorDraft.isAvailable),
        }),
      });
      return;
    }
    if (selectedNode.type === 'group') {
      await apiFetch(`/integrations/ubereats/menu/draft/groups/${encodeURIComponent(selectedNode.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          name: inspectorDraft.name,
          minSelect: Number(inspectorDraft.minSelect ?? 0),
          maxSelect: Number(inspectorDraft.maxSelect ?? 1),
          required: Boolean(inspectorDraft.required),
        }),
      });
      return;
    }
    if (selectedNode.type === 'option') {
      await apiFetch(`/integrations/ubereats/menu/draft/options/${encodeURIComponent(selectedNode.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          displayName: inspectorDraft.displayName,
          priceDeltaCents: Number(inspectorDraft.priceDeltaCents ?? 0),
          isAvailable: Boolean(inspectorDraft.isAvailable),
        }),
      });
    }
  }, [inspectorDraft, selectedNode, selectedStoreId]);

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold">UberEats 接入台</h2>
        <div className="space-y-2 text-sm">
          {MODULES.map((item) => (
            <button type="button" key={item.key} onClick={() => setActive(item.key)} className={`w-full rounded-md px-3 py-2 text-left ${active === item.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">UberEats 集成控制台</h1>
            <button type="button" onClick={() => void refreshVisible()} className="rounded-md border px-3 py-1 text-sm hover:bg-slate-100">刷新当前模块</button>
          </div>
          {actionMessage ? <p className="mt-1 text-sm text-emerald-700">{actionMessage}</p> : null}
          {actionError ? <p className="mt-1 text-sm text-red-700">{actionError}</p> : null}
          {Object.entries(operations).map(([key, phase]) => <p key={key} className="mt-1 text-xs text-slate-600">{key}：{{ QUEUED: '已排队', PROCESSING: '正在处理', WAITING_WEBHOOK: '等待 Uber webhook', RETRYABLE_FAILED: '可重试失败', MANUAL_REVIEW: '需要人工处理', COMPLETED: '完成' }[phase]}</p>)}
        </div>

        {active === 'dashboard' && (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">连接状态</p><p className="mt-2 text-xl font-semibold">{connection?.merchantUberUserId ? '已授权' : '未授权'}</p><p className="text-xs text-slate-500">expiresAt: {safeTime(connection?.expiresAt)}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">门店绑定状态</p><p className="mt-2 text-xl font-semibold">已发现 {stores.length} / 已 provision {provisionedCount}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Webhook 状态</p><p className="mt-2 text-xl font-semibold">200 ACK + 去重处理</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">菜单状态</p><p className="mt-2 text-xl font-semibold">进入对账模块查看</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">运营异常</p><p className="mt-2 text-xl font-semibold">进入工单模块查看</p></div>
            </div>
          </section>
        )}

        {active === 'auth' && (
          <OAuthConnectionPanel>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">A. 环境配置</h3>
              <p className="break-all whitespace-pre-wrap text-sm text-slate-600">Authorize URL: {connectUrl?.authorizeUrl ?? '-'}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">B. 商户授权</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => connectUrl?.authorizeUrl && navigator.clipboard.writeText(connectUrl.authorizeUrl)}>复制 Connect URL</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => window.open('/api/v1/integrations/ubereats/oauth/start', '_blank', 'noopener,noreferrer')}>打开 Uber OAuth</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void connectionData.retry()}>刷新授权状态</button>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <p className="break-all whitespace-pre-wrap">merchantUberUserId：{connection?.merchantUberUserId ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">scope：{connection?.scope ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">tokenType：{connection?.tokenType ?? '-'}</p>
                <p>expiresAt：{safeTime(connection?.expiresAt)}</p>
                <p>connectedAt：{safeTime(connection?.connectedAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">C. 商户门店发现 + D. Provision</h3>
              <p className="mt-1 text-xs text-slate-500">本地打印房间 Store ID 只用于将 Uber 订单路由到打印机，不会修改 Uber 门店的 External Store ID 或 Provision 配置。</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input className="rounded border px-3 py-2" placeholder="SANQ Store ID（integrator_store_id）" value={integratorStoreId} onChange={(e) => setIntegratorStoreId(e.target.value)} />
                <textarea rows={5} className="rounded border px-3 py-2 font-mono text-xs" value={provisionPayload} onChange={(e) => setProvisionPayload(e.target.value)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Store Name</th><th className="px-2 py-2">Location</th><th className="px-2 py-2">Provision</th><th className="px-2 py-2">本地打印房间 Store ID</th><th className="px-2 py-2">操作</th></tr></thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.storeId} className="border-b last:border-0">
                        <td className="break-all whitespace-pre-wrap px-2 py-2 font-mono text-xs">{s.storeId}</td>
                        <td className="px-2 py-2">{s.storeName ?? '-'}</td>
                        <td className="break-all whitespace-pre-wrap px-2 py-2">{s.locationSummary ?? '-'}</td>
                        <td className="px-2 py-2">{s.isProvisioned ? '已 provision' : '未 provision'}</td>
                        <td className="min-w-56 px-2 py-2">
                          <div className="flex gap-2">
                            <input aria-label={`${s.storeName ?? s.storeId} 本地打印房间 Store ID`} className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs" value={posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? ''} placeholder="例如 4750_Yonge_Street" onChange={(event) => setPosStoreIdDrafts((current) => ({ ...current, [s.storeId]: event.target.value }))} />
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={actionLoading[`pos-store-${s.storeId}`] || !(posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? '').trim() || (posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? '').trim() === (s.posExternalStoreId ?? '')}
                              onClick={() => {
                                const posExternalStoreId = (posStoreIdDrafts[s.storeId] ?? '').trim();
                                void runAction(`pos-store-${s.storeId}`, () => apiFetch(`/integrations/ubereats/oauth/stores/${encodeURIComponent(s.storeId)}/pos-external-store-id`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posExternalStoreId }),
                                }).then(() => {
                                  setPosStoreIdDrafts((current) => { const next = { ...current }; delete next[s.storeId]; return next; });
                                }), `已更新 ${s.storeName ?? s.storeId} 的 POS Store ID`);
                              }}
                            >
                              {actionLoading[`pos-store-${s.storeId}`] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => {
                              let payload: Record<string, unknown>;
                              try {
                                payload = JSON.parse(provisionPayload) as Record<string, unknown>;
                              } catch {
                                setActionError('Provision payload 不是合法 JSON');
                                return;
                              }
                              void runAction(`provision-${s.storeId}`, () => apiFetch('/integrations/ubereats/oauth/provision', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantUberUserId: connection?.merchantUberUserId, storeId: s.storeId, payload: { ...payload, integrator_store_id: integratorStoreId || undefined } }),
                              }).then(() => {}), `已提交 ${s.storeId} 的 Provision`);
                            }}
                          >
                            {actionLoading[`provision-${s.storeId}`] ? '提交中...' : '立即 Provision'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </OAuthConnectionPanel>
        )}

        {active === 'store-menu' && (
          <StoreMappingPanel>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Uber 菜单工作台</h3>
              <div className="mt-3 grid gap-2 xl:grid-cols-[2fr_repeat(6,minmax(0,1fr))]">
                <select className="rounded border px-3 py-2 text-sm" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  <option value="">选择门店</option>
                  {stores.map((store) => <option key={store.storeId} value={store.storeId}>{store.storeName ?? store.storeId}</option>)}
                </select>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('reload-draft', () => loadStoreMenuDraft(selectedStoreId), '菜单草稿已刷新', false)}>刷新草稿</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('save-node', saveSelectedNode, '当前节点已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存当前节点</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('publish-dry', () => apiFetch<UberDryRunResponse>('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: true, ...publishFilterPayload }) }).then((result) => { setDryRunSchedule(result); setTaxRateConfirmed(false); }), 'Dry Run Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>Dry Run</button>
                <button type="button" disabled={formalPublishDisabled} title={timezoneMismatch ? '本地与 Uber 门店时区不一致' : !timezoneConfirmed ? '请先确认门店时区' : !taxRateConfirmed ? '请先执行 Dry Run 并确认税率' : blockingValidationIssues.length ? '请先修复阻断错误' : undefined} className="rounded border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void runAction('publish-formal', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: false, timezoneConfirmed, taxRateConfirmed, ...publishFilterPayload }) }).then(() => {}), '已提交，等待 Uber 确认', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>正式 Publish</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('refresh-diff', () => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }), '草稿与 Diff 已刷新', false)}>刷新 Diff</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setStoreMenuTab('publish')}>查看本次 Diff</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setStoreMenuTab('overview')}>查看上次发布版本</button>
              </div>
              <ResourceStatus state={{ loading: menuLoading, error: menuError, lastUpdated: menuFetchedAt }} retry={() => void loadStoreMenuDraft(selectedStoreId)} />
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {STORE_MENU_TABS.map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setStoreMenuTab(tab.key)} className={`rounded-md px-3 py-1.5 ${storeMenuTab === tab.key ? 'bg-slate-900 text-white' : 'border hover:bg-slate-50'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {storeMenuTab === 'overview' && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">已绑定门店</p><p className="mt-2 text-xl font-semibold">{selectedStore?.storeId ?? '-'}</p><p className="text-xs text-slate-500">{selectedStore?.storeName ?? '-'}</p></div>
                <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">最近生成 / draft fetchedAt</p><p className="mt-2 text-xl font-semibold">{safeTime(menuFetchedAt)}</p><p className="text-xs text-slate-500">最近发布：{safeTime(menuDraft?.lastPublishedVersion?.createdAt)}</p></div>
                <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">结构统计</p><p className="mt-2 text-xl font-semibold">item {menuDraft?.sourceMenu.items ?? 0} / group {menuDraft?.sourceMenu.groups ?? 0}</p><p className="text-xs text-slate-500">option item {menuDraft?.sourceMenu.optionItems ?? 0}</p></div>
                <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">未发布差异</p><p className="mt-2 text-xl font-semibold">{menuDraft?.publishSummary.changedItems ?? 0}</p><p className="text-xs text-slate-500">provision：{selectedStore?.isProvisioned ? '已 provision' : '未 provision'}</p></div>
              </div>
            )}

            {storeMenuTab === 'mapping' && (
              <MenuDraftPanel>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px_1fr]">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">网站菜单树（来源）</h4>
                  <div className="mt-3">{renderDraftTree('source', sourceMenuTree)}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">节点映射检查器</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <p><span className="text-slate-500">sourceStableId：</span>{selectedNode?.sourceStableId ?? '-'}</p>
                    <p><span className="text-slate-500">映射后 Uber node id：</span>{selectedNode?.id ?? '-'}</p>
                    <p><span className="text-slate-500">规则：</span>{selectedNode?.type ?? '-'}</p>
                    <p><span className="text-slate-500">override 来源：</span>{selectedNode?.source ?? '-'}</p>
                    <p><span className="text-slate-500">扁平化映射：</span>{(menuDraft?.uberDraft.optionMappings ?? []).filter((mapping) => !selectedNode?.sourceStableId || mapping.sourcePath.includes(selectedNode.sourceStableId)).map((mapping) => mapping.sourcePath.join(' / ')).join('；') || '-'}</p>
                    {(menuDraft?.mappingErrors ?? []).map((error) => <p key={`${error.code}-${error.sourceOptionChoiceStableId}`} className="rounded border border-red-200 bg-red-50 p-1 text-xs text-red-700">{error.code}: {error.message}</p>)}
                    <div>
                      <p className="text-slate-500">关联 edges：</p>
                      <ul className="mt-1 space-y-1">
                        {selectedNodeEdgeInfo.slice(0, 4).map((edge) => <li key={`${edge.from}-${edge.to}-${edge.type}`} className="rounded border p-1 text-xs">{edge.type}: {edge.from} → {edge.to}</li>)}
                        {selectedNodeEdgeInfo.length === 0 ? <li className="text-xs text-slate-400">暂无</li> : null}
                      </ul>
                    </div>
                    <div>
                      <p className="text-slate-500">warning 列表：</p>
                      <ul className="mt-1 space-y-1">
                        {selectedNodeWarnings.map((warning) => <li key={`${warning.code}-${warning.path}`} className="rounded border border-amber-200 bg-amber-50 p-1 text-xs"><strong>{warning.code}</strong> · {warning.path}<br />{warning.message}</li>)}
                        {selectedNodeWarnings.length === 0 ? <li className="text-xs text-slate-400">暂无 warning</li> : null}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">Uber 菜单树（映射结果）</h4>
                  <div className="mt-3 max-h-[520px] overflow-auto">{renderDraftTree('uber-mapping', filteredUberTree)}</div>
                </div>
              </div>
              </MenuDraftPanel>
            )}

            {storeMenuTab === 'editor' && (
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">Uber 菜单树编辑器</h4>
                  <div className="mt-3 max-h-[560px] overflow-auto">{renderDraftTree('uber-editor', filteredUberTree)}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">Inspector</h4>
                  <p className="mt-2 text-sm text-slate-500">当前节点：{selectedNode?.name ?? '-'}</p>
                  {selectedNode?.type === 'item' ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        当前已隐藏“所属分类”编辑，避免将 categoryId 误写入 externalCategoryId。
                      </p>
                      <label className="block"><span className="mb-1 block text-slate-500">displayName</span><input className="w-full rounded border px-2 py-1" value={String(inspectorDraft.displayName ?? '')} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, displayName: e.target.value }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">displayDescription</span><input className="w-full rounded border px-2 py-1" value={String(inspectorDraft.displayDescription ?? '')} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, displayDescription: e.target.value }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">priceCents</span><input type="number" className="w-full rounded border px-2 py-1" value={Number(inspectorDraft.priceCents ?? 0)} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, priceCents: Number(e.target.value) }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">isAvailable</span><select className="w-full rounded border px-2 py-1" value={String(Boolean(inspectorDraft.isAvailable))} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, isAvailable: e.target.value === 'true' }))}><option value="true">上架</option><option value="false">下架</option></select></label>
                      <button type="button" className="rounded border px-3 py-1.5" onClick={() => void runAction('save-node-item', saveSelectedNode, 'item 草稿已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存 item</button>
                    </div>
                  ) : null}
                  {selectedNode?.type === 'group' ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <label className="block"><span className="mb-1 block text-slate-500">name</span><input className="w-full rounded border px-2 py-1" value={String(inspectorDraft.name ?? '')} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, name: e.target.value }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">minSelect</span><input type="number" className="w-full rounded border px-2 py-1" value={Number(inspectorDraft.minSelect ?? 0)} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, minSelect: Number(e.target.value) }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">maxSelect</span><input type="number" className="w-full rounded border px-2 py-1" value={Number(inspectorDraft.maxSelect ?? 1)} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, maxSelect: Number(e.target.value) }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">required</span><select className="w-full rounded border px-2 py-1" value={String(Boolean(inspectorDraft.required))} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, required: e.target.value === 'true' }))}><option value="false">否</option><option value="true">是</option></select></label>
                      <button type="button" className="rounded border px-3 py-1.5" onClick={() => void runAction('save-node-group', saveSelectedNode, 'group 草稿已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存 group</button>
                    </div>
                  ) : null}
                  {selectedNode?.type === 'option' ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <label className="block"><span className="mb-1 block text-slate-500">displayName</span><input className="w-full rounded border px-2 py-1" value={String(inspectorDraft.displayName ?? '')} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, displayName: e.target.value }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">priceDeltaCents</span><input type="number" className="w-full rounded border px-2 py-1" value={Number(inspectorDraft.priceDeltaCents ?? 0)} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, priceDeltaCents: Number(e.target.value) }))} /></label>
                      <label className="block"><span className="mb-1 block text-slate-500">isAvailable</span><select className="w-full rounded border px-2 py-1" value={String(Boolean(inspectorDraft.isAvailable))} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, isAvailable: e.target.value === 'true' }))}><option value="true">上架</option><option value="false">下架</option></select></label>
                      <div>
                        <p className="mb-1 block text-slate-500">Attached child groups</p>
                        <div className="space-y-1">
                          {(selectedNode.childGroupIds ?? []).map((groupId) => (
                            <div key={groupId} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                              <span>{groupId}</span>
                              <button type="button" className="rounded border px-2 py-0.5" onClick={() => void runAction(`unbind-${selectedNode.id}-${groupId}`, () => apiFetch(`/integrations/ubereats/menu/draft/options/${selectedNode.id}/child-groups/${groupId}?storeId=${encodeURIComponent(selectedStoreId)}`, { method: 'DELETE' }).then(() => {}), `已解绑 ${groupId}`, false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>解绑</button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input className="flex-1 rounded border px-2 py-1" placeholder="输入 groupId 绑定" value={String(inspectorDraft.attachGroupId ?? '')} onChange={(e) => setInspectorDraft((prev) => ({ ...prev, attachGroupId: e.target.value }))} />
                          <button type="button" className="rounded border px-2 py-1" onClick={() => {
                            const groupId = String(inspectorDraft.attachGroupId ?? '').trim();
                            if (!groupId) return;
                            void runAction(`bind-${selectedNode.id}-${groupId}`, () => apiFetch(`/integrations/ubereats/menu/draft/options/${selectedNode.id}/child-groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, groupId }) }).then(() => {}), `已绑定 ${groupId}`, false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }));
                          }}>绑定</button>
                        </div>
                      </div>
                      <button type="button" className="rounded border px-3 py-1.5" onClick={() => void runAction('save-node-option', saveSelectedNode, 'option 草稿已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存 option</button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {storeMenuTab === 'publish' && (
              <PublishHistoryPanel>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">发布前 Diff 摘要</h4>
                  <div className="mt-3 space-y-2">
                    {blockingValidationIssues.map((issue) => <div key={`${issue.code}-${issue.path}`} className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800"><p><strong>{issue.code}</strong> · 节点 {issue.sourceStableId ?? '全局'}</p><code className="break-all">{issue.path}</code><p>{issue.message}</p>{issue.sourceStableId ? <button type="button" className="mt-1 underline" onClick={() => setSelectedNodeId(issue.sourceStableId)}>跳转到对应菜品或选项组</button> : null}</div>)}
                    {blockingValidationIssues.length === 0 ? <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-700">当前无阻断错误，可执行 Dry Run 与正式 Publish。</p> : null}
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    <li className="rounded border p-2">总 items：{menuDraft?.publishSummary.totalItems ?? 0}</li>
                    <li className="rounded border p-2">变更 items：{menuDraft?.publishSummary.changedItems ?? 0}</li>
                    <li className="rounded border p-2">总 categories：{menuDraft?.publishSummary.totalCategories ?? 0}</li>
                    <li className="rounded border p-2">总 modifier groups：{menuDraft?.publishSummary.totalModifierGroups ?? 0}</li>
                    <li className="rounded border p-2">缺少图片：{missingImageCount}</li>
                    <li className="rounded border p-2">描述 warnings：{descriptionWarnings.length}</li>
                  </ul>
                  {descriptionWarnings.length > 0 ? <div className="mt-3 space-y-1">{descriptionWarnings.map(({ item, message }) => <div key={item.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"><strong>WARNING</strong> · {item.displayName}：{message}</div>)}</div> : null}
                  <h5 className="mt-4 text-sm font-semibold">菜品发布预览</h5>
                  <div className="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                    {publishPreviewItems.map((item) => (
                      <div key={item.id} className="rounded border p-2 text-xs">
                        {item.imageUrl ? (
                          <div className="relative mb-1 aspect-square w-full overflow-hidden rounded">
                            <Image src={item.imageUrl} alt={item.displayName} fill className="object-cover" sizes="(min-width: 1024px) 160px, (min-width: 768px) 25vw, 50vw" />
                          </div>
                        ) : (
                          <div className="mb-1 flex aspect-square w-full items-center justify-center rounded bg-slate-100 text-slate-500">缺少图片</div>
                        )}
                        <p className="truncate font-medium" title={item.displayName}>{item.displayName}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-600" title={item.displayDescription?.trim() || '缺少描述'}>{item.displayDescription?.trim() || '缺少描述'}</p>
                      </div>
                    ))}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold">最终发布营业时段（门店本地时间）</h5>
                  <p className="mt-1 text-xs text-slate-500">时区：{dryRunSchedule?.serviceAvailabilityTimezone ?? menuDraft?.serviceAvailabilityTimezone ?? '-'}</p>
                  <div className={`mt-2 rounded border p-2 text-xs ${timezoneMismatch ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><p>BusinessConfig.timezone：{businessTimezone ?? '-'}</p><p>Uber 门店时区：{uberTimezone ?? 'API 未返回，需人工核对'}</p>{timezoneMismatch ? <p className="mt-1 font-semibold">时区不一致，已禁止正式发布。</p> : null}<label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={timezoneConfirmed} disabled={timezoneMismatch || !businessTimezone} onChange={(event) => setTimezoneConfirmed(event.target.checked)} /><span>我已在 Uber 门店配置中核对，目标门店使用 IANA timezone <strong>{businessTimezone ?? '-'}</strong>（非固定 UTC offset）。</span></label></div>
                  <ul className="mt-2 space-y-1 text-xs">{(dryRunSchedule?.serviceAvailability ?? menuDraft?.serviceAvailability ?? []).map((day) => <li key={day.day_of_week} className="rounded border p-2"><strong>{day.day_of_week}</strong>：{day.time_periods.map((period) => `${period.start_time}–${period.end_time}`).join('，')}</li>)}</ul>
                  <h5 className="mt-4 text-sm font-semibold">销售税率确认</h5>
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    {dryRunSchedule?.taxRate ? <><p>税率：<strong>{dryRunSchedule.taxRate.percentage}%</strong></p><p>来源：{dryRunSchedule.taxRate.source}</p><label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={taxRateConfirmed} onChange={(event) => setTaxRateConfirmed(event.target.checked)} /><span>我已核对并确认本次正式发布使用以上税率。</span></label></> : <p>请先执行 Dry Run，加载并核对 BusinessConfig.salesTaxRate 后再正式发布。</p>}
                  </div>
                  <h5 className="mt-4 text-sm font-semibold">真实 Diff 列表</h5>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="rounded border p-2">addedItems: {(menuDiff?.addedItems ?? []).join(', ') || '-'}</li>
                    <li className="rounded border p-2">modifiedItems: {menuDiff?.modifiedItems.length ?? 0}</li>
                    <li className="rounded border p-2">deletedItems: {(menuDiff?.deletedItems ?? []).join(', ') || '-'}</li>
                    <li className="rounded border p-2">addedGroups: {(menuDiff?.addedGroups ?? []).join(', ') || '-'}</li>
                    <li className="rounded border p-2">modifiedGroups: {menuDiff?.modifiedGroups.length ?? 0}</li>
                    <li className="rounded border p-2">hierarchyChanges: {menuDiff?.hierarchyChanges.length ?? 0}</li>
                    <li className="rounded border p-2">priceChanges: {menuDiff?.priceChanges.length ?? 0}</li>
                    <li className="rounded border p-2">availabilityChanges: {menuDiff?.availabilityChanges.length ?? 0}</li>
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void runAction('publish-dry-inline', () => apiFetch<UberDryRunResponse>('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: true, ...publishFilterPayload }) }).then((result) => { setDryRunSchedule(result); setTaxRateConfirmed(false); }), 'Dry Run Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>Dry Run Publish</button>
                    <button type="button" disabled={formalPublishDisabled} className="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void runAction('publish-formal-inline', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: false, timezoneConfirmed, taxRateConfirmed, ...publishFilterPayload }) }).then(() => {}), '已提交，等待 Uber 确认', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>正式 Publish</button>
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">最近发布版本</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded border p-2">
                      <p>versionStableId: {menuDraft?.lastPublishedVersion?.versionStableId ?? '-'}</p>
                      <p>status: {menuDraft?.lastPublishedVersion?.status ?? '-'}</p>
                      <p>createdAt: {safeTime(menuDraft?.lastPublishedVersion?.createdAt)}</p>
                      <p>totalItems: {menuDraft?.lastPublishedVersion?.totalItems ?? 0}</p>
                      <p>changedItems: {menuDraft?.lastPublishedVersion?.changedItems ?? 0}</p>
                      <p>finishedAt: {safeTime(menuDraft?.lastPublishedVersion?.finishedAt)}</p>
                      {menuDraft?.lastPublishedVersion?.status === 'SUBMITTED' ? <p className="mt-2 rounded bg-amber-50 p-2 text-amber-800">已提交，等待 Uber 确认。</p> : null}
                      {menuDraft?.lastPublishedVersion?.status === 'SUCCEEDED' ? <p className="mt-2 rounded bg-emerald-50 p-2 text-emerald-700">Uber 已确认菜单处理成功。</p> : null}
                      {menuDraft?.lastPublishedVersion?.status === 'FAILED' ? <div className="mt-2 rounded bg-rose-50 p-2 text-rose-700"><p>{menuDraft.lastPublishedVersion.errorMessage ?? 'Uber 菜单处理失败'}</p>{menuDraft.lastPublishedVersion.errorDetails?.map((error, index) => <p key={`${error.code}-${index}`} className="mt-1 font-mono text-xs">{error.code}{error.path ? ` · ${error.path}` : ''} · {error.message}</p>)}</div> : null}
                    </div>
                    <p className="text-xs text-slate-500">lastPublishedAt(diff): {safeTime(menuDiff?.lastPublishedAt)}</p>
                  </div>
                </div>
              </div>
              </PublishHistoryPanel>
            )}
          </StoreMappingPanel>
        )}

        {active === 'orders-ops' && (
          <OrdersPanel>
            <h3 className="text-lg font-semibold">订单与运营</h3>
            <ResourceStatus state={ordersData} retry={() => void ordersData.retry()} />
            <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">externalOrderId</th><th className="px-2 py-2">orderStableId</th><th className="px-2 py-2">status</th><th className="px-2 py-2">金额</th><th className="px-2 py-2">createdAt</th></tr></thead><tbody>{pendingOrders.map((o) => <tr key={o.externalOrderId} className="border-b"><td className="px-2 py-2">{o.externalOrderId}</td><td className="px-2 py-2">{o.orderStableId}</td><td className="px-2 py-2">{o.status}</td><td className="px-2 py-2">${(o.totalCents / 100).toFixed(2)}</td><td className="px-2 py-2">{safeTime(o.createdAt)}</td></tr>)}</tbody></table>
          </OrdersPanel>
        )}

        {active === 'reconciliation-tickets' && (
          <section className="grid gap-4 lg:grid-cols-2">
            <ReconciliationPanel><div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Reconciliation Reports</h3>
              <ResourceStatus state={reportsData} retry={() => void reportsData.retry()} />
              <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('gen-report', () => apiFetch('/integrations/ubereats/v2/reports/reconciliation/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => {}), '已生成对账报告')}>生成对账报告</button>
              <div className="mt-3 space-y-2 text-sm">{reports.map((r) => <div key={r.reportStableId} className="rounded border p-2"><p>{r.reportStableId}</p><p>totalOrders: {r.totalOrders} / amount: {r.totalAmountCents}</p></div>)}</div>
            </div></ReconciliationPanel>
            <OperationsTicketsPanel><div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Ops Tickets</h3>
              <ResourceStatus state={operationsData} retry={() => void operationsData.retry()} />
              <div className="mt-2 grid grid-cols-2 gap-2"><input className="rounded border px-2 py-1 text-sm" placeholder="按 storeId 过滤" value={ticketStoreFilter} onChange={(e) => setTicketStoreFilter(e.target.value)} /><select className="rounded border px-2 py-1 text-sm" value={ticketStatusFilter} onChange={(e) => setTicketStatusFilter(e.target.value as TicketStatus | '')}><option value="">全部状态</option><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="RESOLVED">RESOLVED</option></select></div>
              <div className="mt-3 space-y-2 text-sm">{tickets.map((t) => <div key={t.ticketStableId} className="rounded border p-2"><div className="flex items-center justify-between"><p>{t.ticketStableId}</p><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runAction(`retry-${t.ticketStableId}`, () => apiFetch(`/integrations/ubereats/v2/ops/tickets/${t.ticketStableId}/retry`, { method: 'POST' }).then(() => {}), `${t.ticketStableId} 已触发重试`)}>Retry</button></div><p>{t.type} / {t.priority} / {t.status}</p><p>{t.title}</p></div>)}</div>
            </div></OperationsTicketsPanel>
          </section>
        )}
      </main>
    </div>
  );
}
