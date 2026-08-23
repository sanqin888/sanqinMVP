export type ModuleKey = 'dashboard' | 'auth' | 'store-menu' | 'orders-ops' | 'reconciliation-tickets';

/** Stable public API primitives; UI code must not import persistence models. */
export type UberFieldError = { field: string; code: string; message: string };
export type UberPublicError = { code: string; message: string; retryable: boolean; correlationId: string; fieldErrors?: UberFieldError[] };
export type UberPageInfo = { limit: number; count: number; hasNextPage: boolean; nextCursor: string | null };
export type UberListResponse<T> = { items: T[]; pageInfo: UberPageInfo; contractVersion: '2' };
export type UberMutationResponse = { operationId: string; status: 'ACCEPTED' | 'SUCCEEDED' | 'FAILED'; error: UberPublicError | null; contractVersion: '2' };
export type ResourceState = { loading: boolean; error: string | null; lastUpdated: string | null };
export type SummaryResponse = { count: number; updatedAt: string | null };
export type OperationPhase = 'QUEUED' | 'PROCESSING' | 'WAITING_WEBHOOK' | 'RETRYABLE_FAILED' | 'MANUAL_REVIEW' | 'COMPLETED';

export type OAuthConnectUrlResponse = { authorizeUrl: string; state: string };
export type OAuthConnectionResponse = { connectionId: string; scope?: string | null; tokenType?: string | null; expiresAt?: string | null; connectedAt?: string | null };
export type UberStore = { storeId: string; storeName?: string; locationSummary?: string; isMapped?: boolean; mappedConnectionId?: string | null; requiresReconnect?: boolean; isProvisioned?: boolean; provisionedAt?: string | null; posExternalStoreId?: string | null; timezone?: string | null };
export type OAuthStoresResponse = { connectionId?: string; stores: UberStore[] };
export type UberStoreStatusResponse = {
  storeId: string;
  status: string;
  offlineReason: string | null;
  offlineReasonMetadata: string | null;
  isOfflineUntil: string | null;
  contractVersion: '2';
};
export type UberStorePrepTimeResponse = {
  storeId: string;
  defaultPrepTimeSeconds: number;
  contractVersion: '2';
};
export type UberIntegrationConfigResponse = {
  storeId: string;
  integrationEnabled: boolean | null;
  allowedCustomerRequests: {
    allowSingleUseItemsRequests: boolean | null;
    allowSpecialInstructionRequests: boolean | null;
  } | null;
  integratorBrandId: string | null;
  integratorStoreId: string | null;
  isOrderManager: boolean | null;
  merchantStoreId: string | null;
  requireManualAcceptance: boolean | null;
  storeConfigurationData: string | null;
  webhooksConfig: Record<string, unknown> | null;
  onlineStatus: string | null;
  orderReleaseEnabled: boolean | null;
  autoAcceptEnabled: boolean | null;
  posMetadata: Record<string, unknown> | null;
  orderManagerClientId: string | null;
  isOrderManagerPending: boolean | null;
  contractVersion: '2';
};
export type PendingOrder = { externalOrderId: string; orderStableId: string; status: string; totalCents: number; createdAt: string; sourceEventType?: string | null };
export type PendingOrdersResponse = UberListResponse<PendingOrder>;
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type Ticket = { ticketStableId: string; type: string; title: string; priority: string; status: TicketStatus; retryCount: number; createdAt: string };
export type TicketsResponse = UberListResponse<Ticket>;
export type ReconciliationReport = { reportStableId: string; totalOrders: number; totalAmountCents: number; syncedOrders: number; pendingOrders: number; failedSyncEvents: number; discrepancyOrders: number; createdAt: string };
export type ReconciliationResponse = UberListResponse<ReconciliationReport>;
export type StoreMenuTabKey = 'overview' | 'mapping' | 'editor' | 'publish';
export type DraftTreeKey = 'source' | 'uber-mapping' | 'uber-editor';
export type DraftNodeType = 'category' | 'item' | 'group' | 'option';
export type UberPreparationType = 'PREPARED' | 'PREPACKAGED';
/** `id` is always the SanQ stableId. Uber publish node ids are backend-only. */
export type DraftNode = { id: string; type: DraftNodeType; name: string; source: 'SOURCE' | 'AUTO-MAPPED' | 'OVERRIDDEN'; status?: 'UNPUBLISHED' | 'ERROR'; priceCents?: number; priceDeltaCents?: number; isAvailable?: boolean; preparationType?: UberPreparationType | null; minSelect?: number; maxSelect?: number; children?: DraftNode[] };
export type UberDraftOptionNode = { id: string; displayName: string; priceDeltaCents: number; isAvailable: boolean; preparationType: UberPreparationType | null; childGroups: Array<{ id: string; name: string; minSelect: number; maxSelect: number }> };
export type UberDraftGroupNode = { id: string; name: string; minSelect: number; maxSelect: number; options: UberDraftOptionNode[] };
export type UberDraftItemNode = { id: string; displayName: string; displayDescription?: string | null; priceCents: number; isAvailable: boolean; preparationType: UberPreparationType | null; imageUrl?: string | null; groups: UberDraftGroupNode[] };
export type UberDraftCategoryNode = { id: string; name: string; items: UberDraftItemNode[] };
export type UberValidationIssue = { code: string; severity: 'ERROR' | 'WARNING'; path: string; stableId: string | null; message: string };
export type UberMenuDraftResponse = { storeId: string | null; sourceMenu: { categories: number; items: number; optionItems: number; groups: number; tree: { categories: UberDraftCategoryNode[] } }; uberDraft: { edges: Array<{ from: string; to: string; type: string }>; tree: { categories: UberDraftCategoryNode[] }; treeNodes: DraftNode[]; optionMappings: Array<{ stableId: string; sourcePath: string[] }> }; mappingWarnings: UberValidationIssue[]; validation: { warnings: UberValidationIssue[]; errors: UberValidationIssue[] }; mappingErrors: Array<{ code: string; stableId: string; message: string }>; publishSummary: { totalItems: number; changedItems: number; totalCategories: number; totalModifierGroups: number }; dirty: boolean; serviceAvailability: Array<{ day_of_week: string; time_periods: Array<{ start_time: string; end_time: string }> }>; serviceAvailabilityTimezone: string; lastPublishedVersion: { versionStableId: string; status: string; createdAt: string | null; totalItems: number; changedItems: number; errorMessage: string | null; errorDetails: Array<{ code: string; path?: string | null; message: string }> | null; finishedAt: string | null } | null; contractVersion: '2' };
export type UberMenuReconciliationResponse = {
  storeId: string;
  uberStoreId: string;
  retrieved: { menuCount: number; categoryCount: number; itemCount: number; modifierGroupCount: number; taxLabelItemCount: number; preparationTypeItemCount: number };
  baseline: { itemCount: number; modifierGroupCount: number; expectedDisableItemInstructions: boolean | null } | null;
  reconciliation: {
    matchesLastSuccessfulPublish: boolean | null;
    missingMenuIds: string[];
    extraMenuIds: string[];
    missingCategoryIds: string[];
    extraCategoryIds: string[];
    missingItemIds: string[];
    extraItemIds: string[];
    missingModifierGroupIds: string[];
    extraModifierGroupIds: string[];
    mismatches: Array<{ resourceType: 'ITEM' | 'MODIFIER_GROUP'; resourceId: string; field: string; expected: string; actual: string }>;
  };
  specialInstructions: { expectedDisableItemInstructions: boolean | null; remoteDisableItemInstructions: boolean | null; verified: boolean };
  contractVersion: '2';
};
export type UberPublishRisk = { severity: 'INFO' | 'WARNING' | 'CRITICAL'; code: string; entityType: string; entityId: string; field: string; previousValue: unknown; currentValue: unknown; sourceValue?: unknown; intentional?: boolean };
export type UberDryRunResponse = Pick<UberMenuDraftResponse, 'serviceAvailability' | 'serviceAvailabilityTimezone'> & { taxRate: { percentage: number; source: string; requiresAdminConfirmation: boolean; confirmed: boolean }; safety?: { semanticallyChanged: boolean; criticalCount: number; risks: UberPublishRisk[]; fingerprint: string } };
export type UberMenuConfigImportPreview = { fingerprint: string; sourceStoreId: string; targetStoreId: string; mode: 'SKIP_EXISTING' | 'OVERWRITE'; counts: Record<'items' | 'options' | 'groups' | 'categories', { create: number; update: number; unchanged: number; conflicts: number }>; conflicts: Array<{ kind: string; stableId: string; source: Record<string, unknown>; target: Record<string, unknown> }>; warnings: string[] };
export type UberMenuDraftDiffResponse = { storeId: string | null; lastPublishedAt: string | null; addedItems: string[]; modifiedItems: Array<{ sourceType: string; stableId: string; priceCents: number; isAvailable: boolean }>; deletedItems: string[]; addedGroups: string[]; modifiedGroups: Array<{ stableId: string; minSelect: number; maxSelect: number }>; deletedGroups: string[]; hierarchyChanges: Array<{ from: string; to: string; type: string }>; deletedEdges: Array<{ from: string; to: string; type: string }>; priceChanges: Array<{ sourceType: string; stableId: string; priceCents: number }>; availabilityChanges: Array<{ sourceType: string; stableId: string; isAvailable: boolean }>; preparationTypeChanges: Array<{ sourceType: 'MENU_ITEM' | 'OPTION_ITEM'; stableId: string; preparationType: UberPreparationType | null }>; contractVersion: '2' };
