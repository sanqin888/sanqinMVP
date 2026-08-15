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
export type DraftNode = { id: string; type: DraftNodeType; name: string; sourceStableId?: string | null; source: 'SOURCE' | 'AUTO-MAPPED' | 'OVERRIDDEN'; status?: 'UNPUBLISHED' | 'ERROR'; priceCents?: number; priceDeltaCents?: number; isAvailable?: boolean; minSelect?: number; maxSelect?: number; childGroupIds?: string[]; children?: DraftNode[] };
export type UberDraftOptionNode = { id: string; sourceOptionChoiceStableId: string; displayName: string; priceDeltaCents: number; isAvailable: boolean; childGroups: Array<{ id: string; name: string; minSelect: number; maxSelect: number }> };
export type UberDraftGroupNode = { id: string; name: string; minSelect: number; maxSelect: number; options: UberDraftOptionNode[] };
export type UberDraftItemNode = { id: string; sourceMenuItemStableId: string; displayName: string; displayDescription?: string | null; priceCents: number; isAvailable: boolean; imageUrl?: string | null; groups: UberDraftGroupNode[] };
export type UberDraftCategoryNode = { id: string; name: string; items: UberDraftItemNode[] };
export type UberValidationIssue = { code: string; severity: 'ERROR' | 'WARNING'; path: string; sourceStableId: string | null; message: string };
export type UberMenuDraftResponse = { storeId: string | null; sourceMenu: { categories: number; items: number; optionItems: number; groups: number; tree: { categories: UberDraftCategoryNode[] } }; uberDraft: { menuId: string; categories: Array<Record<string, unknown>>; items: Array<Record<string, unknown>>; groups: Array<Record<string, unknown>>; edges: Array<{ from: string; to: string; type: string }>; tree: { categories: UberDraftCategoryNode[] }; treeNodes: DraftNode[]; optionMappings: Array<{ sourceOptionChoiceStableId: string; compositeOptionItemId: string; sourcePath: string[] }> }; mappingWarnings: UberValidationIssue[]; validation: { warnings: UberValidationIssue[]; errors: UberValidationIssue[] }; mappingErrors: Array<{ code: string; sourceOptionChoiceStableId: string; message: string }>; publishSummary: { totalItems: number; changedItems: number; totalCategories: number; totalModifierGroups: number }; dirty: boolean; serviceAvailability: Array<{ day_of_week: string; time_periods: Array<{ start_time: string; end_time: string }> }>; serviceAvailabilityTimezone: string; lastPublishedVersion: { versionStableId: string; status: string; createdAt: string | null; totalItems: number; changedItems: number; errorMessage: string | null; errorDetails: Array<{ code: string; path?: string | null; message: string }> | null; finishedAt: string | null } | null; contractVersion: '2' };
export type UberDryRunResponse = Pick<UberMenuDraftResponse, 'serviceAvailability' | 'serviceAvailabilityTimezone'> & { taxRate: { percentage: number; source: string; requiresAdminConfirmation: boolean; confirmed: boolean } };
export type UberMenuDraftDiffResponse = { storeId: string | null; lastPublishedAt: string | null; addedItems: string[]; modifiedItems: Array<{ sourceType: string; stableId: string; priceCents: number; isAvailable: boolean }>; deletedItems: string[]; addedGroups: string[]; modifiedGroups: Array<{ stableId: string; minSelect: number; maxSelect: number }>; deletedGroups: string[]; hierarchyChanges: Array<{ from: string; to: string; type: string }>; deletedEdges: Array<{ from: string; to: string; type: string }>; priceChanges: Array<{ sourceType: string; stableId: string; priceCents: number }>; availabilityChanges: Array<{ sourceType: string; stableId: string; isAvailable: boolean }>; contractVersion: '2' };
