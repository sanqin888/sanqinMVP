"use client";

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { publishMenu, uberApiFetch } from '../api/uberAdminApi';
import { useUberMenuDraft } from '../hooks/useUberMenuDraft';
import { ResourceStatus } from '../dashboard/ResourceStatus';
import type {
  DraftNode,
  DraftTreeKey,
  StoreMenuTabKey,
  UberDraftCategoryNode,
  UberDraftGroupNode,
  UberDryRunResponse,
  UberMenuConfigImportPreview,
  UberStore,
} from '../types';
import type { RunAction } from '../hooks/useUberMutationState';

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

export function MenuWorkspace({
  stores,
  runAction,
}: {
  stores: UberStore[];
  runAction: RunAction;
}) {
  const [storeMenuTab, setStoreMenuTab] =
    useState<StoreMenuTabKey>('overview');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [taxRateConfirmed, setTaxRateConfirmed] = useState(false);
  const [dryRunSchedule, setDryRunSchedule] =
    useState<UberDryRunResponse | null>(null);
  const [criticalRisksAcknowledged, setCriticalRisksAcknowledged] =
    useState(false);
  const [importPreview, setImportPreview] =
    useState<UberMenuConfigImportPreview | null>(null);
  const [importSourceStoreId, setImportSourceStoreId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<
    Record<string, unknown>
  >({});
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedSourceNodeIds, setSelectedSourceNodeIds] = useState<
    Set<string> | null
  >(null);
  const {
    menuDraft,
    menuDiff,
    menuLoading,
    menuFetchedAt,
    menuError,
    loadMenuDraft: loadStoreMenuDraft,
  } = useUberMenuDraft(selectedStoreId, true);

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
    setCriticalRisksAcknowledged(false);
    setImportPreview(null);
    setImportSourceStoreId('');
  }, [selectedStoreId]);

  const draftCategories = useMemo(
    () => menuDraft?.uberDraft.tree.categories ?? [],
    [menuDraft?.uberDraft.tree.categories],
  );
  const sourceDraftCategories = useMemo(
    () => menuDraft?.sourceMenu.tree.categories ?? draftCategories,
    [draftCategories, menuDraft?.sourceMenu.tree.categories],
  );
  const publishPreviewItems = useMemo(
    () => draftCategories.flatMap((category) => category.items),
    [draftCategories],
  );
  const missingImageCount = useMemo(
    () =>
      publishPreviewItems.filter((item) => !item.imageUrl?.trim()).length,
    [publishPreviewItems],
  );
  const descriptionWarnings = useMemo(
    () =>
      publishPreviewItems.flatMap((item) => {
        const description = item.displayDescription?.trim() ?? '';
        if (!description) return [{ item, message: '缺少描述' }];
        if (description.length > UBER_ITEM_DESCRIPTION_MAX_LENGTH) {
          return [
            {
              item,
              message: `描述过长（${description.length}/${UBER_ITEM_DESCRIPTION_MAX_LENGTH}）`,
            },
          ];
        }
        return [];
      }),
    [publishPreviewItems],
  );

  const toDraftTree = useCallback(
    (
      categories: UberDraftCategoryNode[],
      source: DraftNode['source'],
    ): DraftNode[] => {
      const toGroup = (group: UberDraftGroupNode): DraftNode => ({
        id: group.id,
        type: 'group',
        name: group.name,
        source,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        children: group.options.map((option) => ({
          id: option.id,
          type: 'option',
          name: option.displayName,
          source,
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          children: option.childGroups.map((childGroup) => ({
            id: childGroup.id,
            type: 'group',
            name: childGroup.name,
            source,
            minSelect: childGroup.minSelect,
            maxSelect: childGroup.maxSelect,
          })),
        })),
      });
      return categories.map((category) => ({
        id: category.id,
        type: 'category',
        name: category.name,
        source,
        children: category.items.map((item) => ({
          id: item.id,
          type: 'item',
          name: item.displayName,
          source,
          status:
            source === 'AUTO-MAPPED' && menuDraft?.dirty
              ? 'UNPUBLISHED'
              : undefined,
          priceCents: item.priceCents,
          isAvailable: item.isAvailable,
          children: item.groups.map(toGroup),
        })),
      }));
    },
    [menuDraft?.dirty],
  );

  const sourceMenuTree = useMemo(
    () => toDraftTree(sourceDraftCategories, 'SOURCE'),
    [sourceDraftCategories, toDraftTree],
  );
  const fallbackUberTree = useMemo(
    () => toDraftTree(draftCategories, 'AUTO-MAPPED'),
    [draftCategories, toDraftTree],
  );
  const normalizedUberDraftTree = useMemo(
    () => menuDraft?.uberDraft.treeNodes ?? fallbackUberTree,
    [fallbackUberTree, menuDraft?.uberDraft.treeNodes],
  );

  const sourceNodeLookup = useMemo(() => {
    const map = new Map<string, DraftNode>();
    const travel = (nodes: DraftNode[]) =>
      nodes.forEach((node) => {
        map.set(node.id, node);
        if (node.children?.length) travel(node.children);
      });
    travel(sourceMenuTree);
    return map;
  }, [sourceMenuTree]);

  useEffect(() => {
    if (
      selectedSourceNodeIds !== null ||
      menuDraft?.storeId !== selectedStoreId ||
      sourceNodeLookup.size === 0
    ) {
      return;
    }
    setSelectedSourceNodeIds(new Set(sourceNodeLookup.keys()));
  }, [
    menuDraft?.storeId,
    selectedSourceNodeIds,
    selectedStoreId,
    sourceNodeLookup,
  ]);

  const exclusionFilter = useMemo(() => {
    const excludedCategoryIds = new Set<string>();
    const excludedGroupIds = new Set<string>();
    const excludedMenuItemStableIds = new Set<string>();
    const excludedOptionChoiceStableIds = new Set<string>();
    if (selectedSourceNodeIds !== null) {
      sourceNodeLookup.forEach((node, stableId) => {
        if (selectedSourceNodeIds.has(stableId)) return;
        if (node.type === 'category') excludedCategoryIds.add(stableId);
        if (node.type === 'group') excludedGroupIds.add(stableId);
        if (node.type === 'item') excludedMenuItemStableIds.add(stableId);
        if (node.type === 'option') excludedOptionChoiceStableIds.add(stableId);
      });
    }
    return {
      excludedCategoryIds,
      excludedGroupIds,
      excludedMenuItemStableIds,
      excludedOptionChoiceStableIds,
    };
  }, [selectedSourceNodeIds, sourceNodeLookup]);

  const filteredUberTree = useMemo(() => {
    const travel = (nodes: DraftNode[]): DraftNode[] =>
      nodes.flatMap((node) => {
        if (
          node.type === 'category' &&
          exclusionFilter.excludedCategoryIds.has(node.id)
        )
          return [];
        if (
          node.type === 'group' &&
          exclusionFilter.excludedGroupIds.has(node.id)
        )
          return [];
        if (
          node.type === 'item' &&
          exclusionFilter.excludedMenuItemStableIds.has(node.id)
        )
          return [];
        if (
          node.type === 'option' &&
          exclusionFilter.excludedOptionChoiceStableIds.has(node.id)
        )
          return [];
        const children = node.children?.length
          ? travel(node.children)
          : undefined;
        if (
          (node.type === 'category' ||
            node.type === 'item' ||
            node.type === 'group') &&
          children &&
          children.length === 0
        )
          return [];
        return [{ ...node, children }];
      });
    return travel(normalizedUberDraftTree);
  }, [exclusionFilter, normalizedUberDraftTree]);

  const allDraftNodes = useMemo(() => {
    const nodes: DraftNode[] = [];
    const travel = (list: DraftNode[]) =>
      list.forEach((node) => {
        nodes.push(node);
        if (node.children?.length) travel(node.children);
      });
    travel(filteredUberTree);
    return nodes;
  }, [filteredUberTree]);
  const selectedNode =
    allDraftNodes.find((node) => node.id === selectedNodeId) ??
    allDraftNodes[0] ??
    null;

  useEffect(() => {
    if (!allDraftNodes.length) {
      setSelectedNodeId(null);
      return;
    }
    if (
      !selectedNodeId ||
      !allDraftNodes.some((node) => node.id === selectedNodeId)
    ) {
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
    } else if (selectedNode.type === 'group') {
      setInspectorDraft({
        name: selectedNode.name,
        minSelect: selectedNode.minSelect ?? 0,
        maxSelect: selectedNode.maxSelect ?? 1,
        required: (selectedNode.minSelect ?? 0) > 0,
      });
    } else if (selectedNode.type === 'option') {
      setInspectorDraft({
        displayName: selectedNode.name,
        priceDeltaCents: selectedNode.priceDeltaCents ?? 0,
        isAvailable: selectedNode.isAvailable ?? true,
      });
    } else {
      setInspectorDraft({});
    }
  }, [selectedNode]);

  const selectedStore = stores.find(
    (store) => store.storeId === selectedStoreId,
  );
  const businessTimezone = menuDraft?.serviceAvailabilityTimezone ?? null;
  const uberTimezone = selectedStore?.timezone?.trim() || null;
  const timezoneMismatch = Boolean(
    businessTimezone && uberTimezone && businessTimezone !== uberTimezone,
  );
  const blockingValidationIssues = menuDraft?.validation.errors ?? [];
  const formalPublishDisabled =
    blockingValidationIssues.length > 0 ||
    timezoneMismatch ||
    !timezoneConfirmed ||
    !taxRateConfirmed;
  const selectedNodeWarnings = useMemo(
    () =>
      menuDraft?.mappingWarnings.filter((warning) =>
        selectedNode
          ? warning.stableId === selectedNode.id ||
            warning.path.includes(selectedNode.id)
          : true,
      ) ?? [],
    [menuDraft?.mappingWarnings, selectedNode],
  );
  const selectedNodeEdgeInfo = useMemo(
    () =>
      (menuDraft?.uberDraft.edges ?? []).filter(
        (edge) =>
          edge.from === selectedNode?.id || edge.to === selectedNode?.id,
      ),
    [menuDraft?.uberDraft.edges, selectedNode?.id],
  );
  const publishFilterPayload = useMemo(
    () => ({
      excludedCategoryIds: Array.from(exclusionFilter.excludedCategoryIds),
      excludedGroupIds: Array.from(exclusionFilter.excludedGroupIds),
      excludedMenuItemStableIds: Array.from(
        exclusionFilter.excludedMenuItemStableIds,
      ),
      excludedOptionChoiceStableIds: Array.from(
        exclusionFilter.excludedOptionChoiceStableIds,
      ),
    }),
    [exclusionFilter],
  );

  const isNodeExpanded = useCallback(
    (treeKey: DraftTreeKey, stableId: string) =>
      expandedNodeKeys.has(`${treeKey}:${stableId}`),
    [expandedNodeKeys],
  );
  const toggleNodeExpand = useCallback(
    (treeKey: DraftTreeKey, stableId: string) => {
      const key = `${treeKey}:${stableId}`;
      setExpandedNodeKeys((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );
  const handleSourceNodeChecked = useCallback(
    (stableId: string, checked: boolean) => {
      const root = sourceNodeLookup.get(stableId);
      if (!root) return;
      const ids: string[] = [];
      const travel = (node: DraftNode) => {
        ids.push(node.id);
        node.children?.forEach(travel);
      };
      travel(root);
      setSelectedSourceNodeIds((previous) => {
        const next = new Set(previous ?? []);
        ids.forEach((id) => {
          if (checked) next.add(id);
          else next.delete(id);
        });
        return next;
      });
    },
    [sourceNodeLookup],
  );

  const renderDraftTree = useCallback(
    (treeKey: DraftTreeKey, nodes: DraftNode[], depth = 0) => (
      <ul
        className={
          depth === 0
            ? 'space-y-2'
            : 'ml-4 mt-2 space-y-2 border-l border-slate-200 pl-3'
        }
      >
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
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleNodeExpand(treeKey, node.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      toggleNodeExpand(treeKey, node.id);
                    }}
                  >
                    {isNodeExpanded(treeKey, node.id) ? '-' : '+'}
                  </span>
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center text-xs text-slate-300">
                    ·
                  </span>
                )}
                {treeKey === 'source' ? (
                  <input
                    type="checkbox"
                    checked={selectedSourceNodeIds?.has(node.id) ?? true}
                    onChange={(event) => {
                      event.stopPropagation();
                      handleSourceNodeChecked(node.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : null}
                <span className="mr-2 text-slate-500">
                  {node.type.toUpperCase()}
                </span>
                {node.name}
              </span>
              <span className="flex items-center gap-1">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                  {node.source}
                </span>
                {node.status ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                    {node.status}
                  </span>
                ) : null}
              </span>
            </button>
            {node.children?.length && isNodeExpanded(treeKey, node.id)
              ? renderDraftTree(treeKey, node.children, depth + 1)
              : null}
          </li>
        ))}
      </ul>
    ),
    [
      handleSourceNodeChecked,
      isNodeExpanded,
      selectedNodeId,
      selectedSourceNodeIds,
      toggleNodeExpand,
    ],
  );

  const saveSelectedNode = useCallback(async () => {
    if (!selectedNode || !selectedStoreId) return;
    const stableId = encodeURIComponent(selectedNode.id);
    if (selectedNode.type === 'item') {
      await uberApiFetch(`/integrations/ubereats/menu/draft/items/${stableId}`, {
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
      await uberApiFetch(`/integrations/ubereats/menu/draft/groups/${stableId}`, {
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
      await uberApiFetch(`/integrations/ubereats/menu/draft/options/${stableId}`, {
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

  const runDryPublish = useCallback(
    () =>
      publishMenu<UberDryRunResponse>('/integrations/ubereats/menu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          dryRun: true,
          ...publishFilterPayload,
        }),
      }).then((result) => {
        setDryRunSchedule(result);
        setTaxRateConfirmed(false);
        setCriticalRisksAcknowledged(false);
      }),
    [publishFilterPayload, selectedStoreId],
  );

  const runFormalPublish = useCallback(
    () =>
      uberApiFetch('/integrations/ubereats/menu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          dryRun: false,
          timezoneConfirmed,
          taxRateConfirmed,
          safetyFingerprint: criticalRisksAcknowledged
            ? dryRunSchedule?.safety?.fingerprint
            : undefined,
          ...publishFilterPayload,
        }),
      }).then(() => undefined),
    [
      criticalRisksAcknowledged,
      dryRunSchedule?.safety?.fingerprint,
      publishFilterPayload,
      selectedStoreId,
      taxRateConfirmed,
      timezoneConfirmed,
    ],
  );

  return (
    <section aria-label="store-mapping-and-menu" className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-lg font-semibold">Uber 菜单工作台</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="min-w-64 rounded border px-3 py-2 text-sm"
            value={selectedStoreId}
            onChange={(event) => setSelectedStoreId(event.target.value)}
          >
            <option value="">选择门店</option>
            {stores.map((store) => (
              <option key={store.storeId} value={store.storeId}>
                {store.storeName ?? store.storeId}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs"
            onClick={() =>
              void runAction(
                'reload-draft',
                () => loadStoreMenuDraft(selectedStoreId),
                '菜单草稿已刷新',
                false,
              )
            }
          >
            刷新草稿
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs"
            onClick={() =>
              void runAction(
                'save-node',
                saveSelectedNode,
                '当前节点已保存',
                false,
              ).then(() =>
                loadStoreMenuDraft(selectedStoreId, { keepSelection: true }),
              )
            }
          >
            保存当前节点
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs"
            onClick={() =>
              void runAction(
                'publish-dry',
                runDryPublish,
                'Dry Run Publish 成功',
                false,
              ).then(() =>
                loadStoreMenuDraft(selectedStoreId, { keepSelection: true }),
              )
            }
          >
            Dry Run
          </button>
          <button
            type="button"
            disabled={formalPublishDisabled}
            className="rounded border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() =>
              void runAction(
                'publish-formal',
                runFormalPublish,
                '已提交，等待 Uber 确认',
                false,
              ).then(() =>
                loadStoreMenuDraft(selectedStoreId, { keepSelection: true }),
              )
            }
          >
            正式 Publish
          </button>
        </div>
        <ResourceStatus
          state={{
            loading: menuLoading,
            error: menuError,
            lastUpdated: menuFetchedAt,
          }}
          retry={() => void loadStoreMenuDraft(selectedStoreId)}
        />
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {STORE_MENU_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStoreMenuTab(tab.key)}
              className={`rounded-md px-3 py-1.5 ${storeMenuTab === tab.key ? 'bg-slate-900 text-white' : 'border hover:bg-slate-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {storeMenuTab === 'overview' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-slate-500">已绑定门店</p>
              <p className="mt-2 text-xl font-semibold">
                {selectedStore?.storeId ?? '-'}
              </p>
              <p className="text-xs text-slate-500">
                {selectedStore?.storeName ?? '-'}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-slate-500">Draft fetchedAt</p>
              <p className="mt-2 text-xl font-semibold">
                {safeTime(menuFetchedAt)}
              </p>
              <p className="text-xs text-slate-500">
                最近发布：{safeTime(menuDraft?.lastPublishedVersion?.createdAt)}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-slate-500">结构统计</p>
              <p className="mt-2 text-xl font-semibold">
                item {menuDraft?.sourceMenu.items ?? 0} / group{' '}
                {menuDraft?.sourceMenu.groups ?? 0}
              </p>
              <p className="text-xs text-slate-500">
                option item {menuDraft?.sourceMenu.optionItems ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm text-slate-500">未发布差异</p>
              <p className="mt-2 text-xl font-semibold">
                {menuDraft?.publishSummary.changedItems ?? 0}
              </p>
              <p className="text-xs text-slate-500">
                provision：{selectedStore?.isProvisioned ? '已 provision' : '未 provision'}
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h4 className="font-semibold">Uber Menu Configuration</h4>
            <p className="mt-1 text-sm text-slate-500">
              只复制 stableId 菜单配置；不复制 OAuth、门店身份或发布历史，也不会自动发布。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                aria-label="Source Test Store"
                className="rounded border px-3 py-2 text-sm"
                value={importSourceStoreId}
                onChange={(event) => {
                  setImportSourceStoreId(event.target.value);
                  setImportPreview(null);
                }}
              >
                <option value="">显式选择 Source Store</option>
                {stores
                  .filter((store) => store.storeId !== selectedStoreId)
                  .map((store) => (
                    <option key={store.storeId} value={store.storeId}>
                      {store.storeName ?? store.storeId}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!importSourceStoreId || !selectedStoreId}
                className="rounded border px-3 py-2 text-sm disabled:opacity-40"
                onClick={() =>
                  void runAction(
                    'preview-config-import',
                    () =>
                      uberApiFetch<UberMenuConfigImportPreview>(
                        '/integrations/ubereats/menu/config-import/preview',
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            sourceStoreId: importSourceStoreId,
                            targetStoreId: selectedStoreId,
                            mode: 'SKIP_EXISTING',
                          }),
                        },
                      ).then(setImportPreview),
                    '配置导入 Preview 已生成',
                    false,
                  )
                }
              >
                Preview Import
              </button>
              {importPreview ? (
                <button
                  type="button"
                  className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
                  onClick={() =>
                    void runAction(
                      'apply-config-import',
                      () =>
                        uberApiFetch(
                          '/integrations/ubereats/menu/config-import/apply',
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              sourceStoreId: importPreview.sourceStoreId,
                              targetStoreId: importPreview.targetStoreId,
                              mode: 'SKIP_EXISTING',
                              previewFingerprint: importPreview.fingerprint,
                            }),
                          },
                        ).then(() => loadStoreMenuDraft(selectedStoreId)),
                      '配置已导入；Draft 已重建但尚未发布',
                      true,
                    )
                  }
                >
                  Apply（跳过 Production 冲突）
                </button>
              ) : null}
            </div>
            {importPreview ? (
              <div className="mt-3 text-sm">
                {Object.entries(importPreview.counts).map(([kind, count]) => (
                  <p key={kind}>
                    {kind}: Create {count.create}, Update {count.update}, Unchanged{' '}
                    {count.unchanged}, Conflicts {count.conflicts}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {dryRunSchedule?.safety ? (
        <div
          className={`rounded-xl border p-4 ${dryRunSchedule.safety.criticalCount ? 'border-red-400 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}
        >
          <h4 className="font-semibold">Publish Safety Summary</h4>
          <p>
            {dryRunSchedule.safety.criticalCount
              ? `⚠ ${dryRunSchedule.safety.criticalCount} 项 CRITICAL 风险，普通 Publish 已阻断。`
              : '✓ No unexpected override fallback'}
          </p>
          {dryRunSchedule.safety.risks.map((risk) => (
            <p key={`${risk.code}:${risk.entityId}`} className="text-sm">
              {risk.code} · {risk.entityId}: {String(risk.previousValue)} →{' '}
              {String(risk.currentValue)}
            </p>
          ))}
          {dryRunSchedule.safety.criticalCount > 0 ? (
            <label className="mt-2 flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={criticalRisksAcknowledged}
                onChange={(event) =>
                  setCriticalRisksAcknowledged(event.target.checked)
                }
              />
              我已在 MFA 会话中逐项审阅并明确授权本次 full menu PUT
            </label>
          ) : null}
        </div>
      ) : null}

      {storeMenuTab === 'mapping' ? (
        <section aria-label="menu-draft">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px_1fr]">
            <div className="rounded-xl border bg-white p-4">
              <h4 className="font-semibold">网站菜单树（来源）</h4>
              <div className="mt-3">
                {renderDraftTree('source', sourceMenuTree)}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h4 className="font-semibold">节点映射检查器</h4>
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <span className="text-slate-500">stableId：</span>
                  {selectedNode?.id ?? '-'}
                </p>
                <p>
                  <span className="text-slate-500">类型：</span>
                  {selectedNode?.type ?? '-'}
                </p>
                <p>
                  <span className="text-slate-500">override 来源：</span>
                  {selectedNode?.source ?? '-'}
                </p>
                <p>
                  <span className="text-slate-500">扁平化映射：</span>
                  {(menuDraft?.uberDraft.optionMappings ?? [])
                    .filter(
                      (mapping) =>
                        !selectedNode ||
                        mapping.stableId === selectedNode.id ||
                        mapping.sourcePath.includes(selectedNode.id),
                    )
                    .map((mapping) => mapping.sourcePath.join(' / '))
                    .join('；') || '-'}
                </p>
                {(menuDraft?.mappingErrors ?? []).map((error) => (
                  <p
                    key={`${error.code}-${error.stableId}`}
                    className="rounded border border-red-200 bg-red-50 p-1 text-xs text-red-700"
                  >
                    {error.code}: {error.message}
                  </p>
                ))}
                <div>
                  <p className="text-slate-500">关联 edges：</p>
                  <ul className="mt-1 space-y-1">
                    {selectedNodeEdgeInfo.slice(0, 4).map((edge) => (
                      <li
                        key={`${edge.from}-${edge.to}-${edge.type}`}
                        className="rounded border p-1 text-xs"
                      >
                        {edge.type}: {edge.from} → {edge.to}
                      </li>
                    ))}
                    {selectedNodeEdgeInfo.length === 0 ? (
                      <li className="text-xs text-slate-400">暂无</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <p className="text-slate-500">warning 列表：</p>
                  <ul className="mt-1 space-y-1">
                    {selectedNodeWarnings.map((warning) => (
                      <li
                        key={`${warning.code}-${warning.path}`}
                        className="rounded border border-amber-200 bg-amber-50 p-1 text-xs"
                      >
                        <strong>{warning.code}</strong> · {warning.path}
                        <br />
                        {warning.message}
                      </li>
                    ))}
                    {selectedNodeWarnings.length === 0 ? (
                      <li className="text-xs text-slate-400">暂无 warning</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h4 className="font-semibold">Uber 菜单树（映射结果）</h4>
              <div className="mt-3 max-h-[520px] overflow-auto">
                {renderDraftTree('uber-mapping', filteredUberTree)}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {storeMenuTab === 'editor' ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border bg-white p-4">
            <h4 className="font-semibold">Uber 菜单树编辑器</h4>
            <div className="mt-3 max-h-[560px] overflow-auto">
              {renderDraftTree('uber-editor', filteredUberTree)}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h4 className="font-semibold">Inspector</h4>
            <p className="mt-2 text-sm text-slate-500">
              当前 stableId：{selectedNode?.id ?? '-'}
            </p>
            {selectedNode?.type === 'item' ? (
              <div className="mt-3 space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-slate-500">displayName</span>
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={String(inspectorDraft.displayName ?? '')}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        displayName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">
                    displayDescription
                  </span>
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={String(inspectorDraft.displayDescription ?? '')}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        displayDescription: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">priceCents</span>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1"
                    value={Number(inspectorDraft.priceCents ?? 0)}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        priceCents: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">isAvailable</span>
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={String(Boolean(inspectorDraft.isAvailable))}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        isAvailable: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">上架</option>
                    <option value="false">下架</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5"
                  onClick={() =>
                    void runAction(
                      'save-node-item',
                      saveSelectedNode,
                      'item 草稿已保存',
                      false,
                    ).then(() =>
                      loadStoreMenuDraft(selectedStoreId, {
                        keepSelection: true,
                      }),
                    )
                  }
                >
                  保存 item
                </button>
                <button
                  type="button"
                  className="rounded border border-amber-500 px-3 py-1.5 text-amber-800"
                  onClick={() => {
                    if (!selectedNode) return;
                    void runAction(
                      'restore-source-price',
                      () =>
                        uberApiFetch(
                          `/integrations/ubereats/menu/draft/items/${encodeURIComponent(selectedNode.id)}/restore-source-price`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ storeId: selectedStoreId }),
                          },
                        ).then(() => loadStoreMenuDraft(selectedStoreId)),
                      '已恢复网站价格并记录操作意图',
                      true,
                    );
                  }}
                >
                  恢复网站价格
                </button>
              </div>
            ) : null}
            {selectedNode?.type === 'group' ? (
              <div className="mt-3 space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-slate-500">name</span>
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={String(inspectorDraft.name ?? '')}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">minSelect</span>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1"
                    value={Number(inspectorDraft.minSelect ?? 0)}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        minSelect: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">maxSelect</span>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1"
                    value={Number(inspectorDraft.maxSelect ?? 1)}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        maxSelect: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">required</span>
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={String(Boolean(inspectorDraft.required))}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        required: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5"
                  onClick={() =>
                    void runAction(
                      'save-node-group',
                      saveSelectedNode,
                      'group 草稿已保存',
                      false,
                    ).then(() =>
                      loadStoreMenuDraft(selectedStoreId, {
                        keepSelection: true,
                      }),
                    )
                  }
                >
                  保存 group
                </button>
              </div>
            ) : null}
            {selectedNode?.type === 'option' ? (
              <div className="mt-3 space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-slate-500">displayName</span>
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={String(inspectorDraft.displayName ?? '')}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        displayName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">
                    priceDeltaCents
                  </span>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1"
                    value={Number(inspectorDraft.priceDeltaCents ?? 0)}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        priceDeltaCents: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-slate-500">isAvailable</span>
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={String(Boolean(inspectorDraft.isAvailable))}
                    onChange={(event) =>
                      setInspectorDraft((previous) => ({
                        ...previous,
                        isAvailable: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">上架</option>
                    <option value="false">下架</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5"
                  onClick={() =>
                    void runAction(
                      'save-node-option',
                      saveSelectedNode,
                      'option 草稿已保存',
                      false,
                    ).then(() =>
                      loadStoreMenuDraft(selectedStoreId, {
                        keepSelection: true,
                      }),
                    )
                  }
                >
                  保存 option
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {storeMenuTab === 'publish' ? (
        <section aria-label="publish-history">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <h4 className="font-semibold">发布前 Diff 摘要</h4>
              <div className="mt-3 space-y-2">
                {blockingValidationIssues.map((issue) => (
                  <div
                    key={`${issue.code}-${issue.path}`}
                    className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800"
                  >
                    <p>
                      <strong>{issue.code}</strong> · 节点{' '}
                      {issue.stableId ?? '全局'}
                    </p>
                    <code className="break-all">{issue.path}</code>
                    <p>{issue.message}</p>
                    {issue.stableId ? (
                      <button
                        type="button"
                        className="mt-1 underline"
                        onClick={() => setSelectedNodeId(issue.stableId)}
                      >
                        跳转到对应菜品或选项组
                      </button>
                    ) : null}
                  </div>
                ))}
                {blockingValidationIssues.length === 0 ? (
                  <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-700">
                    当前无阻断错误，可执行 Dry Run 与正式 Publish。
                  </p>
                ) : null}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="rounded border p-2">
                  总 items：{menuDraft?.publishSummary.totalItems ?? 0}
                </li>
                <li className="rounded border p-2">
                  变更 items：{menuDraft?.publishSummary.changedItems ?? 0}
                </li>
                <li className="rounded border p-2">
                  总 categories：{menuDraft?.publishSummary.totalCategories ?? 0}
                </li>
                <li className="rounded border p-2">
                  总 modifier groups：
                  {menuDraft?.publishSummary.totalModifierGroups ?? 0}
                </li>
                <li className="rounded border p-2">
                  缺少图片：{missingImageCount}
                </li>
                <li className="rounded border p-2">
                  描述 warnings：{descriptionWarnings.length}
                </li>
              </ul>
              {descriptionWarnings.length ? (
                <div className="mt-3 space-y-1">
                  {descriptionWarnings.map(({ item, message }) => (
                    <div
                      key={item.id}
                      className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
                    >
                      <strong>WARNING</strong> · {item.displayName}：{message}
                    </div>
                  ))}
                </div>
              ) : null}
              <h5 className="mt-4 text-sm font-semibold">菜品发布预览</h5>
              <div className="mt-2 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {publishPreviewItems.map((item) => (
                  <div key={item.id} className="rounded border p-2 text-xs">
                    {item.imageUrl ? (
                      <div className="relative mb-1 aspect-square w-full overflow-hidden rounded">
                        <Image
                          src={item.imageUrl}
                          alt={item.displayName}
                          fill
                          className="object-cover"
                          sizes="(min-width: 1024px) 160px, (min-width: 768px) 25vw, 50vw"
                        />
                      </div>
                    ) : (
                      <div className="mb-1 flex aspect-square w-full items-center justify-center rounded bg-slate-100 text-slate-500">
                        缺少图片
                      </div>
                    )}
                    <p className="truncate font-medium">{item.displayName}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-600">
                      {item.displayDescription?.trim() || '缺少描述'}
                    </p>
                  </div>
                ))}
              </div>
              <h5 className="mt-4 text-sm font-semibold">
                最终发布营业时段（门店本地时间）
              </h5>
              <p className="mt-1 text-xs text-slate-500">
                时区：
                {dryRunSchedule?.serviceAvailabilityTimezone ??
                  menuDraft?.serviceAvailabilityTimezone ??
                  '-'}
              </p>
              <div
                className={`mt-2 rounded border p-2 text-xs ${timezoneMismatch ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                <p>BusinessConfig.timezone：{businessTimezone ?? '-'}</p>
                <p>Uber 门店时区：{uberTimezone ?? 'API 未返回，需人工核对'}</p>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={timezoneConfirmed}
                    disabled={timezoneMismatch || !businessTimezone}
                    onChange={(event) =>
                      setTimezoneConfirmed(event.target.checked)
                    }
                  />
                  <span>我已核对目标门店时区。</span>
                </label>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {(
                  dryRunSchedule?.serviceAvailability ??
                  menuDraft?.serviceAvailability ??
                  []
                ).map((day) => (
                  <li key={day.day_of_week} className="rounded border p-2">
                    <strong>{day.day_of_week}</strong>：
                    {day.time_periods
                      .map(
                        (period) =>
                          `${period.start_time}–${period.end_time}`,
                      )
                      .join('，')}
                  </li>
                ))}
              </ul>
              <h5 className="mt-4 text-sm font-semibold">销售税率确认</h5>
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                {dryRunSchedule?.taxRate ? (
                  <>
                    <p>
                      税率：<strong>{dryRunSchedule.taxRate.percentage}%</strong>
                    </p>
                    <p>来源：{dryRunSchedule.taxRate.source}</p>
                    <label className="mt-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={taxRateConfirmed}
                        onChange={(event) =>
                          setTaxRateConfirmed(event.target.checked)
                        }
                      />
                      <span>我已核对并确认本次正式发布使用以上税率。</span>
                    </label>
                  </>
                ) : (
                  <p>请先执行 Dry Run 后再正式发布。</p>
                )}
              </div>
              <h5 className="mt-4 text-sm font-semibold">真实 Diff 列表</h5>
              <ul className="mt-2 space-y-1 text-xs">
                <li className="rounded border p-2">
                  addedItems: {(menuDiff?.addedItems ?? []).join(', ') || '-'}
                </li>
                <li className="rounded border p-2">
                  modifiedItems: {menuDiff?.modifiedItems.length ?? 0}
                </li>
                <li className="rounded border p-2">
                  deletedItems: {(menuDiff?.deletedItems ?? []).join(', ') || '-'}
                </li>
                <li className="rounded border p-2">
                  addedGroups: {(menuDiff?.addedGroups ?? []).join(', ') || '-'}
                </li>
                <li className="rounded border p-2">
                  modifiedGroups: {menuDiff?.modifiedGroups.length ?? 0}
                </li>
                <li className="rounded border p-2">
                  hierarchyChanges: {menuDiff?.hierarchyChanges.length ?? 0}
                </li>
                <li className="rounded border p-2">
                  priceChanges: {menuDiff?.priceChanges.length ?? 0}
                </li>
                <li className="rounded border p-2">
                  availabilityChanges: {menuDiff?.availabilityChanges.length ?? 0}
                </li>
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() =>
                    void runAction(
                      'publish-dry-inline',
                      runDryPublish,
                      'Dry Run Publish 成功',
                      false,
                    ).then(() =>
                      loadStoreMenuDraft(selectedStoreId, {
                        keepSelection: true,
                      }),
                    )
                  }
                >
                  Dry Run Publish
                </button>
                <button
                  type="button"
                  disabled={formalPublishDisabled}
                  className="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() =>
                    void runAction(
                      'publish-formal-inline',
                      runFormalPublish,
                      '已提交，等待 Uber 确认',
                      false,
                    ).then(() =>
                      loadStoreMenuDraft(selectedStoreId, {
                        keepSelection: true,
                      }),
                    )
                  }
                >
                  正式 Publish
                </button>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h4 className="font-semibold">最近发布版本</h4>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded border p-2">
                  <p>
                    versionStableId:{' '}
                    {menuDraft?.lastPublishedVersion?.versionStableId ?? '-'}
                  </p>
                  <p>status: {menuDraft?.lastPublishedVersion?.status ?? '-'}</p>
                  <p>
                    createdAt: {safeTime(menuDraft?.lastPublishedVersion?.createdAt)}
                  </p>
                  <p>
                    totalItems: {menuDraft?.lastPublishedVersion?.totalItems ?? 0}
                  </p>
                  <p>
                    changedItems:{' '}
                    {menuDraft?.lastPublishedVersion?.changedItems ?? 0}
                  </p>
                  <p>
                    finishedAt:{' '}
                    {safeTime(menuDraft?.lastPublishedVersion?.finishedAt)}
                  </p>
                  {menuDraft?.lastPublishedVersion?.errorMessage ? (
                    <p className="mt-2 rounded bg-rose-50 p-2 text-rose-700">
                      {menuDraft.lastPublishedVersion.errorMessage}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  lastPublishedAt(diff): {safeTime(menuDiff?.lastPublishedAt)}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
