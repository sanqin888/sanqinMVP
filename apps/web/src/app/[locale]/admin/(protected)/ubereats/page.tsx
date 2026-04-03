'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type ModuleKey = 'dashboard' | 'auth' | 'testing' | 'store-menu' | 'orders-ops' | 'reconciliation-tickets';

type ScopeResult = {
  scope: string;
  tokenIssued: boolean;
  apiValidated?: boolean;
  apiSkipped?: boolean;
  status?: number;
  detail?: string;
  reason?: string;
};

type ScopesVerifyResponse = { ok: boolean; results: ScopeResult[] };
type DebugTokenResponse = {
  requestedScope: string | null;
  normalizedScope: string;
  tokenPrefix: string;
  tokenLength: number;
  usedDefaultScopes: boolean;
  forceRefreshed: boolean;
};
type OAuthConnectUrlResponse = { authorizeUrl: string; state: string };
type OAuthConnectionResponse = {
  merchantUberUserId: string;
  scope?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  connectedAt?: string | null;
};
type OAuthStoresResponse = {
  merchantUberUserId?: string;
  stores: Array<{
    storeId: string;
    storeName?: string;
    locationSummary?: string;
    isProvisioned?: boolean;
    provisionedAt?: string | null;
    posExternalStoreId?: string | null;
  }>;
};

type PendingOrder = {
  externalOrderId: string;
  orderStableId: string;
  status: string;
  totalCents: number;
  createdAt: string;
  sourceEventType?: string | null;
};

type PendingOrdersResponse = { items?: PendingOrder[] };
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
type TicketsResponse = {
  items: Array<{
    ticketStableId: string;
    type: string;
    title: string;
    priority: string;
    status: TicketStatus;
    retryCount: number;
    lastError?: string | null;
    createdAt: string;
  }>;
};

type ReconciliationResponse = {
  items: Array<{
    reportStableId: string;
    totalOrders: number;
    totalAmountCents: number;
    syncedOrders: number;
    pendingOrders: number;
    failedSyncEvents: number;
    discrepancyOrders: number;
    createdAt: string;
  }>;
};

type CreatedOrdersResponse = {
  storeId: string;
  orderCount: number;
  requestUrl: string;
  tokenPrefix: string;
  tokenLength: number;
  orders: Array<{ id: string; currentState: string; placedAt: string }>;
};

type StoreMenuTabKey = 'overview' | 'mapping' | 'editor' | 'publish';
type DraftTreeKey = 'source' | 'uber-mapping' | 'uber-editor';
type DraftNodeType = 'category' | 'item' | 'group' | 'option';
type DraftNode = {
  id: string;
  type: DraftNodeType;
  name: string;
  sourceStableId?: string | null;
  source: 'SOURCE' | 'AUTO-MAPPED' | 'OVERRIDDEN';
  status?: 'UNPUBLISHED' | 'ERROR';
  priceCents?: number;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  minSelect?: number;
  maxSelect?: number;
  childGroupIds?: string[];
  children?: DraftNode[];
};

type UberDraftOptionNode = {
  id: string;
  sourceOptionChoiceStableId: string;
  displayName: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  childGroups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
  }>;
};

type UberDraftGroupNode = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: UberDraftOptionNode[];
};

type UberDraftItemNode = {
  id: string;
  sourceMenuItemStableId: string;
  displayName: string;
  displayDescription?: string | null;
  priceCents: number;
  isAvailable: boolean;
  groups: UberDraftGroupNode[];
};

type UberDraftCategoryNode = {
  id: string;
  name: string;
  items: UberDraftItemNode[];
};

type UberMenuDraftResponse = {
  storeId: string;
  sourceMenu: {
    categories: number;
    items: number;
    optionItems: number;
    groups: number;
  };
  uberDraft: {
    menuId: string;
    categories: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
    groups: Array<Record<string, unknown>>;
    edges: Array<{ from: string; to: string; type: string }>;
    tree: {
      categories: UberDraftCategoryNode[];
    };
    treeNodes?: DraftNode[];
  };
  mappingWarnings: string[];
  publishSummary: {
    totalItems: number;
    changedItems: number;
    totalCategories: number;
    totalModifierGroups: number;
  };
  dirty: boolean;
  storePricing?: {
    priceAdjustmentPercent: number;
  };
  lastPublishedVersion?: {
    versionStableId: string;
    status: string;
    createdAt: string;
    totalItems: number;
    changedItems: number;
  } | null;
};

type UberMenuDraftDiffResponse = {
  storeId: string;
  lastPublishedAt: string | null;
  addedItems: string[];
  modifiedItems: Array<{ sourceType: string; stableId: string; priceCents: number; isAvailable: boolean }>;
  deletedItems: string[];
  addedGroups: string[];
  modifiedGroups: Array<{ stableId: string; minSelect: number; maxSelect: number }>;
  deletedGroups?: string[];
  hierarchyChanges: Array<{ from: string; to: string; type: string }>;
  deletedEdges?: Array<{ from: string; to: string; type: string }>;
  priceChanges: Array<{ sourceType: string; stableId: string; priceCents: number }>;
  availabilityChanges: Array<{ sourceType: string; stableId: string; isAvailable: boolean }>;
};

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'dashboard', label: '总览 Dashboard' },
  { key: 'auth', label: '接入与授权' },
  { key: 'testing', label: '测试中心' },
  { key: 'store-menu', label: '门店与菜单' },
  { key: 'orders-ops', label: '订单与运营' },
  { key: 'reconciliation-tickets', label: '对账与工单' },
];

const DEFAULT_SCOPES = ['eats.store', 'eats.order', 'eats.report', 'eats.store.orders.read', 'eats.store.status.write'];
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

export default function UberEatsAdminPage() {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [connectUrl, setConnectUrl] = useState<OAuthConnectUrlResponse | null>(null);
  const [connection, setConnection] = useState<OAuthConnectionResponse | null>(null);
  const [stores, setStores] = useState<OAuthStoresResponse['stores']>([]);
  const [scopes, setScopes] = useState<ScopeResult[]>([]);
  const [tokenDebug, setTokenDebug] = useState<DebugTokenResponse | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [tickets, setTickets] = useState<TicketsResponse['items']>([]);
  const [reports, setReports] = useState<ReconciliationResponse['items']>([]);
  const [createdOrders, setCreatedOrders] = useState<CreatedOrdersResponse | null>(null);

  const [scopeInput, setScopeInput] = useState('');
  const [verifyStoreId, setVerifyStoreId] = useState('');
  const [verifyOrderId, setVerifyOrderId] = useState('');
  const [integratorStoreId, setIntegratorStoreId] = useState('');
  const [provisionPayload, setProvisionPayload] = useState('{\n  "is_order_manager": true\n}');
  const [ticketStoreFilter, setTicketStoreFilter] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | ''>('');
  const [storeMenuTab, setStoreMenuTab] = useState<StoreMenuTabKey>('overview');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [menuDraft, setMenuDraft] = useState<UberMenuDraftResponse | null>(null);
  const [menuDiff, setMenuDiff] = useState<UberMenuDraftDiffResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<Record<string, unknown>>({});
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuFetchedAt, setMenuFetchedAt] = useState<string | null>(null);
  const [storePriceAdjustmentPercent, setStorePriceAdjustmentPercent] = useState(0);
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(() => new Set());
  const [selectedSourceNodeIds, setSelectedSourceNodeIds] = useState<Set<string> | null>(null);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const setLoadingByKey = (key: string, value: boolean) => {
    setActionLoading((prev) => ({ ...prev, [key]: value }));
  };

  async function runAction(key: string, fn: () => Promise<void>, successText: string, refresh = true) {
    setActionError(null);
    setActionMessage(null);
    setLoadingByKey(key, true);
    try {
      await fn();
      setActionMessage(successText);
      if (refresh) await loadAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setLoadingByKey(key, false);
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);

    const tasks = await Promise.allSettled([
      apiFetch<OAuthConnectUrlResponse>('/integrations/ubereats/oauth/connect-url'),
      apiFetch<OAuthConnectionResponse>('/integrations/ubereats/oauth/connection'),
      apiFetch<ScopesVerifyResponse>('/integrations/ubereats/debug/scopes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: DEFAULT_SCOPES, forceRefresh: false, storeId: verifyStoreId || undefined, orderId: verifyOrderId || undefined }),
      }),
      apiFetch<TicketsResponse>(`/integrations/ubereats/ops/tickets${ticketStoreFilter || ticketStatusFilter ? `?${new URLSearchParams({ ...(ticketStoreFilter ? { storeId: ticketStoreFilter } : {}), ...(ticketStatusFilter ? { status: ticketStatusFilter } : {}) }).toString()}` : ''}`),
      apiFetch<ReconciliationResponse>('/integrations/ubereats/reports/reconciliation?limit=20'),
      apiFetch<PendingOrdersResponse>('/integrations/ubereats/orders/pending'),
      apiFetch<OAuthStoresResponse>('/integrations/ubereats/oauth/stores'),
      apiFetch<CreatedOrdersResponse>('/integrations/ubereats/debug/created-orders'),
    ]);

    const errors: string[] = [];
    const [connect, conn, verify, ticketRes, reportRes, orderRes, storeRes, created] = tasks;

    if (connect.status === 'fulfilled') setConnectUrl(connect.value); else errors.push('connect-url');
    if (conn.status === 'fulfilled') setConnection(conn.value); else setConnection(null);
    if (verify.status === 'fulfilled') setScopes(verify.value.results ?? []); else errors.push('scopes verify');
    if (ticketRes.status === 'fulfilled') setTickets(ticketRes.value.items ?? []); else errors.push('tickets');
    if (reportRes.status === 'fulfilled') setReports(reportRes.value.items ?? []); else errors.push('reports');
    if (orderRes.status === 'fulfilled') setPendingOrders(orderRes.value.items ?? []); else errors.push('orders');
    if (storeRes.status === 'fulfilled') {
      setStores(storeRes.value.stores ?? []);
    } else errors.push('oauth stores');
    if (created.status === 'fulfilled') setCreatedOrders(created.value); else setCreatedOrders(null);

    if (errors.length > 0) {
      setGlobalError(`部分区块加载失败：${errors.join('、')}，其余模块仍可使用。`);
    }

    setLoading(false);
  }, [ticketStatusFilter, ticketStoreFilter, verifyOrderId, verifyStoreId]);

  const loadStoreMenuDraft = useCallback(async (storeId: string, options?: { keepSelection?: boolean }) => {
    if (!storeId) {
      setMenuDraft(null);
      setMenuDiff(null);
      setSelectedNodeId(null);
      setInspectorDraft({});
      return;
    }
    setMenuLoading(true);
    try {
      const [draftRes, diffRes] = await Promise.all([
        apiFetch<UberMenuDraftResponse>(`/integrations/ubereats/menu/draft?storeId=${encodeURIComponent(storeId)}`),
        apiFetch<UberMenuDraftDiffResponse>(`/integrations/ubereats/menu/draft/diff?storeId=${encodeURIComponent(storeId)}`),
      ]);
      setMenuDraft(draftRes);
      setMenuDiff(diffRes);
      setStorePriceAdjustmentPercent(Number(draftRes.storePricing?.priceAdjustmentPercent ?? 0));
      setMenuFetchedAt(new Date().toISOString());
      if (!options?.keepSelection) {
        setSelectedNodeId(null);
        setInspectorDraft({});
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '菜单草稿加载失败');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedStoreId && stores[0]?.storeId) {
      setSelectedStoreId(stores[0].storeId);
    }
  }, [selectedStoreId, stores]);

  useEffect(() => {
    if (!selectedStoreId) return;
    void loadStoreMenuDraft(selectedStoreId);
  }, [selectedStoreId, loadStoreMenuDraft]);

  useEffect(() => {
    setExpandedNodeKeys(new Set());
    setSelectedSourceNodeIds(null);
  }, [selectedStoreId]);

  const openTickets = useMemo(() => tickets.filter((t) => t.status !== 'RESOLVED').length, [tickets]);
  const verifiedCount = scopes.filter((s) => s.apiValidated || s.apiSkipped).length;
  const failedCount = scopes.filter((s) => !s.tokenIssued || s.apiValidated === false).length;
  const provisionedCount = stores.filter((s) => s.isProvisioned).length;
  const draftCategories = useMemo(
    () => menuDraft?.uberDraft.tree.categories ?? [],
    [menuDraft?.uberDraft.tree.categories],
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
  const { sourceTree: sourceMenuTree, uberTree: uberDraftTree } = useMemo(
    () => toDraftTrees(draftCategories),
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
    if (selectedSourceNodeIds !== null) return;
    const allIds = new Set<string>(Array.from(sourceNodeLookup.keys()));
    setSelectedSourceNodeIds(allIds);
  }, [selectedSourceNodeIds, sourceNodeLookup]);

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
    () => menuDraft?.mappingWarnings.filter((warning) => selectedNode?.name ? warning.includes(selectedNode.name) : true) ?? menuDraft?.mappingWarnings ?? [],
    [menuDraft?.mappingWarnings, selectedNode?.name],
  );

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
            <button type="button" onClick={() => void loadAll()} className="rounded-md border px-3 py-1 text-sm hover:bg-slate-100">{loading ? '刷新中…' : '刷新数据'}</button>
          </div>
          {globalError ? <p className="mt-2 text-sm text-amber-700">{globalError}</p> : null}
          {actionMessage ? <p className="mt-1 text-sm text-emerald-700">{actionMessage}</p> : null}
          {actionError ? <p className="mt-1 text-sm text-red-700">{actionError}</p> : null}
        </div>

        {active === 'dashboard' && (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">连接状态</p><p className="mt-2 text-xl font-semibold">{connection?.merchantUberUserId ? '已授权' : '未授权'}</p><p className="text-xs text-slate-500">expiresAt: {safeTime(connection?.expiresAt)}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">App Scopes 状态</p><p className="mt-2 text-xl font-semibold">已验证 {verifiedCount} / 失败 {failedCount}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">门店绑定状态</p><p className="mt-2 text-xl font-semibold">已发现 {stores.length} / 已 provision {provisionedCount}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Webhook 状态</p><p className="mt-2 text-xl font-semibold">200 ACK + 去重处理</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">菜单状态</p><p className="mt-2 text-xl font-semibold">{reports[0] ? '有发布/对账记录' : '暂无发布记录'}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">运营异常</p><p className="mt-2 text-xl font-semibold">Open Tickets {openTickets}</p></div>
            </div>
          </section>
        )}

        {active === 'auth' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">A. 环境配置</h3>
              <p className="break-all whitespace-pre-wrap text-sm text-slate-600">Authorize URL: {connectUrl?.authorizeUrl ?? '-'}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">B. 商户授权</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => connectUrl?.authorizeUrl && navigator.clipboard.writeText(connectUrl.authorizeUrl)}>复制 Connect URL</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => window.open('/api/v1/integrations/ubereats/oauth/start', '_blank', 'noopener,noreferrer')}>打开 Uber OAuth</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void loadAll()}>刷新授权状态</button>
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
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input className="rounded border px-3 py-2" placeholder="SANQ Store ID（integrator_store_id）" value={integratorStoreId} onChange={(e) => setIntegratorStoreId(e.target.value)} />
                <textarea rows={5} className="rounded border px-3 py-2 font-mono text-xs" value={provisionPayload} onChange={(e) => setProvisionPayload(e.target.value)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Store Name</th><th className="px-2 py-2">Location</th><th className="px-2 py-2">Provision</th><th className="px-2 py-2">POS External Store ID</th><th className="px-2 py-2">操作</th></tr></thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.storeId} className="border-b last:border-0">
                        <td className="break-all whitespace-pre-wrap px-2 py-2 font-mono text-xs">{s.storeId}</td>
                        <td className="px-2 py-2">{s.storeName ?? '-'}</td>
                        <td className="break-all whitespace-pre-wrap px-2 py-2">{s.locationSummary ?? '-'}</td>
                        <td className="px-2 py-2">{s.isProvisioned ? '已 provision' : '未 provision'}</td>
                        <td className="break-all whitespace-pre-wrap px-2 py-2">{s.posExternalStoreId ?? '-'}</td>
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
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: s.storeId, payload: { ...payload, integrator_store_id: integratorStoreId || undefined } }),
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
          </section>
        )}

        {active === 'testing' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Scopes 验证</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input className="rounded border px-3 py-2 text-sm" placeholder="storeId（可选）" value={verifyStoreId} onChange={(e) => setVerifyStoreId(e.target.value)} />
                <input className="rounded border px-3 py-2 text-sm" placeholder="orderId（可选）" value={verifyOrderId} onChange={(e) => setVerifyOrderId(e.target.value)} />
                <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runAction('verify-scope', async () => {
                  const res = await apiFetch<ScopesVerifyResponse>('/integrations/ubereats/debug/scopes/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes: DEFAULT_SCOPES, forceRefresh: true, storeId: verifyStoreId || undefined, orderId: verifyOrderId || undefined }) });
                  setScopes(res.results ?? []);
                }, 'Scopes 验证完成', false)}>重新验证</button>
              </div>
              <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Scope</th><th className="px-2 py-2">Token</th><th className="px-2 py-2">API</th><th className="px-2 py-2">status</th><th className="px-2 py-2">detail</th></tr></thead><tbody>{scopes.map((s) => <tr key={s.scope} className="border-b"><td className="px-2 py-2">{s.scope}</td><td className="px-2 py-2">{s.tokenIssued ? '✅' : '❌'}</td><td className="px-2 py-2">{s.apiValidated ? '✅' : s.apiSkipped ? '⏭️' : '❌'}</td><td className="px-2 py-2">{s.status ?? '-'}</td><td className="px-2 py-2">{s.detail ?? s.reason ?? '-'}</td></tr>)}</tbody></table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-lg font-semibold">Token 调试</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('token-default', async () => setTokenDebug(await apiFetch<DebugTokenResponse>('/integrations/ubereats/debug/token')), '默认 Token 获取成功', false)}>获取默认 token</button>
                  <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('token-refresh', async () => setTokenDebug(await apiFetch<DebugTokenResponse>('/integrations/ubereats/debug/token?forceRefresh=true')), 'Token 强制刷新成功', false)}>Force refresh</button>
                </div>
                <div className="mt-2 flex gap-2"><input className="flex-1 rounded border px-3 py-2 text-sm" placeholder="指定 scope" value={scopeInput} onChange={(e) => setScopeInput(e.target.value)} /><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runAction('token-scope', async () => setTokenDebug(await apiFetch<DebugTokenResponse>(`/integrations/ubereats/debug/token?scope=${encodeURIComponent(scopeInput)}`)), '自定义 scope Token 获取成功', false)}>测试</button></div>
                {tokenDebug ? <div className="mt-2 text-sm"><p>requestedScope: {tokenDebug.requestedScope ?? '-'}</p><p>normalizedScope: {tokenDebug.normalizedScope}</p><p>tokenPrefix: {tokenDebug.tokenPrefix}</p><p>tokenLength: {tokenDebug.tokenLength}</p></div> : null}
              </div>

              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-lg font-semibold">Webhook / 状态联调 / Sandbox 订单</h3>
                <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('status-sync', () => apiFetch('/integrations/ubereats/store/status/sync', { method: 'POST' }).then(() => {}), '已完成本地状态同步预览')}>{actionLoading['status-sync'] ? '处理中...' : '本地状态同步预览'}</button>
                <div className="mt-3 text-sm">
                  <p>storeId: {createdOrders?.storeId ?? '-'}</p>
                  <p>requestUrl: {createdOrders?.requestUrl ?? '-'}</p>
                  <p>tokenPrefix/tokenLength: {createdOrders ? `${createdOrders.tokenPrefix} / ${createdOrders.tokenLength}` : '-'}</p>
                  <p>created-orders count: {createdOrders?.orderCount ?? 0}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {active === 'store-menu' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Uber 菜单工作台</h3>
              <div className="mt-3 grid gap-2 xl:grid-cols-[2fr_repeat(6,minmax(0,1fr))]">
                <select className="rounded border px-3 py-2 text-sm" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                  <option value="">选择门店</option>
                  {stores.map((store) => <option key={store.storeId} value={store.storeId}>{store.storeName ?? store.storeId}</option>)}
                </select>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('reload-draft', () => loadStoreMenuDraft(selectedStoreId), '菜单草稿已刷新', false)}>刷新草稿</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('save-node', saveSelectedNode, '当前节点已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存当前节点</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('publish-dry', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: true, ...publishFilterPayload }) }).then(() => {}), 'Dry Run Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>Dry Run</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('publish-formal', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: false, ...publishFilterPayload }) }).then(() => {}), '正式 Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>正式 Publish</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => void runAction('refresh-diff', () => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }), '草稿与 Diff 已刷新', false)}>刷新 Diff</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setStoreMenuTab('publish')}>查看本次 Diff</button>
                <button type="button" className="rounded border px-3 py-2 text-xs" onClick={() => setStoreMenuTab('overview')}>查看上次发布版本</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{menuLoading ? '菜单模块加载中…' : `菜单模块最后刷新：${safeTime(menuFetchedAt)}`}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {STORE_MENU_TABS.map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setStoreMenuTab(tab.key)} className={`rounded-md px-3 py-1.5 ${storeMenuTab === tab.key ? 'bg-slate-900 text-white' : 'border hover:bg-slate-50'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {storeMenuTab === 'overview' && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">已绑定门店</p><p className="mt-2 text-xl font-semibold">{selectedStore?.storeId ?? '-'}</p><p className="text-xs text-slate-500">{selectedStore?.storeName ?? '-'}</p></div>
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">最近生成 / draft fetchedAt</p><p className="mt-2 text-xl font-semibold">{safeTime(menuFetchedAt)}</p><p className="text-xs text-slate-500">最近发布：{safeTime(menuDraft?.lastPublishedVersion?.createdAt)}</p></div>
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">结构统计</p><p className="mt-2 text-xl font-semibold">item {menuDraft?.sourceMenu.items ?? 0} / group {menuDraft?.sourceMenu.groups ?? 0}</p><p className="text-xs text-slate-500">option item {menuDraft?.sourceMenu.optionItems ?? 0}</p></div>
                  <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">未发布差异</p><p className="mt-2 text-xl font-semibold">{menuDraft?.publishSummary.changedItems ?? 0}</p><p className="text-xs text-slate-500">provision：{selectedStore?.isProvisioned ? '已 provision' : '未 provision'}</p></div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h5 className="font-semibold">Uber 商品默认价格上浮</h5>
                  <p className="mt-1 text-xs text-slate-500">仅影响映射后的商品基础价格；选项加价保持网站菜单原值，不参与上浮。若商品在 Inspector 手工改过 priceCents，则手工价优先。</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">价格上浮百分比（%）</span>
                      <input type="number" min={0} max={500} step={0.1} className="w-40 rounded border px-2 py-1" value={Number(storePriceAdjustmentPercent)} onChange={(e) => setStorePriceAdjustmentPercent(Number(e.target.value))} />
                    </label>
                    <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void runAction('save-store-price-adjust', () => apiFetch('/integrations/ubereats/menu/draft/store-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, priceAdjustmentPercent: Number(storePriceAdjustmentPercent) }) }).then(() => {}), '门店价格上浮已保存', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>保存上浮配置</button>
                  </div>
                </div>
              </div>
            )}

            {storeMenuTab === 'mapping' && (
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
                        {selectedNodeWarnings.map((warning) => <li key={warning} className="rounded border border-amber-200 bg-amber-50 p-1 text-xs">{warning}</li>)}
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
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold">发布前 Diff 摘要</h4>
                  <ul className="mt-3 space-y-2 text-sm">
                    <li className="rounded border p-2">总 items：{menuDraft?.publishSummary.totalItems ?? 0}</li>
                    <li className="rounded border p-2">变更 items：{menuDraft?.publishSummary.changedItems ?? 0}</li>
                    <li className="rounded border p-2">总 categories：{menuDraft?.publishSummary.totalCategories ?? 0}</li>
                    <li className="rounded border p-2">总 modifier groups：{menuDraft?.publishSummary.totalModifierGroups ?? 0}</li>
                  </ul>
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
                    <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void runAction('publish-dry-inline', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: true, ...publishFilterPayload }) }).then(() => {}), 'Dry Run Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>Dry Run Publish</button>
                    <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => void runAction('publish-formal-inline', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: selectedStoreId, dryRun: false, ...publishFilterPayload }) }).then(() => {}), '正式 Publish 成功', false).then(() => loadStoreMenuDraft(selectedStoreId, { keepSelection: true }))}>正式 Publish</button>
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
                    </div>
                    <p className="text-xs text-slate-500">lastPublishedAt(diff): {safeTime(menuDiff?.lastPublishedAt)}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {active === 'orders-ops' && (
          <section className="rounded-xl border bg-white p-4">
            <h3 className="text-lg font-semibold">订单与运营</h3>
            <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">externalOrderId</th><th className="px-2 py-2">orderStableId</th><th className="px-2 py-2">status</th><th className="px-2 py-2">金额</th><th className="px-2 py-2">createdAt</th></tr></thead><tbody>{pendingOrders.map((o) => <tr key={o.externalOrderId} className="border-b"><td className="px-2 py-2">{o.externalOrderId}</td><td className="px-2 py-2">{o.orderStableId}</td><td className="px-2 py-2">{o.status}</td><td className="px-2 py-2">${(o.totalCents / 100).toFixed(2)}</td><td className="px-2 py-2">{safeTime(o.createdAt)}</td></tr>)}</tbody></table>
          </section>
        )}

        {active === 'reconciliation-tickets' && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Reconciliation Reports</h3>
              <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('gen-report', () => apiFetch('/integrations/ubereats/reports/reconciliation/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => {}), '已生成对账报告')}>生成对账报告</button>
              <div className="mt-3 space-y-2 text-sm">{reports.map((r) => <div key={r.reportStableId} className="rounded border p-2"><p>{r.reportStableId}</p><p>totalOrders: {r.totalOrders} / amount: {r.totalAmountCents}</p></div>)}</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Ops Tickets</h3>
              <div className="mt-2 grid grid-cols-2 gap-2"><input className="rounded border px-2 py-1 text-sm" placeholder="按 storeId 过滤" value={ticketStoreFilter} onChange={(e) => setTicketStoreFilter(e.target.value)} /><select className="rounded border px-2 py-1 text-sm" value={ticketStatusFilter} onChange={(e) => setTicketStatusFilter(e.target.value as TicketStatus | '')}><option value="">全部状态</option><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="RESOLVED">RESOLVED</option></select></div>
              <div className="mt-3 space-y-2 text-sm">{tickets.map((t) => <div key={t.ticketStableId} className="rounded border p-2"><div className="flex items-center justify-between"><p>{t.ticketStableId}</p><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runAction(`retry-${t.ticketStableId}`, () => apiFetch(`/integrations/ubereats/ops/tickets/${t.ticketStableId}/retry`, { method: 'POST' }).then(() => {}), `${t.ticketStableId} 已触发重试`)}>Retry</button></div><p>{t.type} / {t.priority} / {t.status}</p><p>{t.title}</p></div>)}</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
