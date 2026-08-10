import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import type { UberMenuNotificationEventV1 } from '../../contracts/events/uber-menu-notification.v1';
import type { UberEventOrdering } from './uber-order-processing.ports';
import type {
  PublishMenuInput,
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
  UpdateDraftGroupInput,
  UpdateDraftItemInput,
  UpdateDraftOptionInput,
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';

export const UBER_MENU_DRAFT_PORT = Symbol('UBER_MENU_DRAFT_PORT');
export const UBER_MENU_PUBLISH_PORT = Symbol('UBER_MENU_PUBLISH_PORT');
export const UBER_MENU_AVAILABILITY_PORT = Symbol(
  'UBER_MENU_AVAILABILITY_PORT',
);
export const UBER_ORDER_IMPORT_PORT = Symbol('UBER_ORDER_IMPORT_PORT');
export const UBER_ORDER_ACTION_PORT = Symbol('UBER_ORDER_ACTION_PORT');
export const UBER_ORDER_SYNC_PORT = Symbol('UBER_ORDER_SYNC_PORT');
export interface UberMenuDraftPort {
  listUberItemChannelConfigs(storeId?: string): Promise<any>;
  listUberPublishedMenuItems(storeId?: string): Promise<any>;
  listUberOptionItemConfigs(storeId?: string): Promise<any>;
  upsertUberItemChannelConfig(input: UpsertPriceBookItemInput): Promise<any>;
  upsertUberOptionItemConfig(input: UpsertOptionItemConfigInput): Promise<any>;
  getUberMenuDraft(storeId?: string): Promise<any>;
  updateUberDraftItem(id: string, input: UpdateDraftItemInput): Promise<any>;
  updateUberDraftGroup(id: string, input: UpdateDraftGroupInput): Promise<any>;
  updateUberDraftOption(
    id: string,
    input: UpdateDraftOptionInput,
  ): Promise<any>;
  bindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<any>;
  unbindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<any>;
  getUberMenuDraftDiff(storeId?: string): Promise<any>;
}
export interface UberMenuPublishPort {
  publishUberMenu(input: PublishMenuInput): Promise<any>;
  recoverTimedOutPublications(timeoutMs?: number): Promise<number>;
  processWebhookEvent(
    eventType: string,
    eventId: string,
    payload: UberMenuNotificationEventV1,
  ): Promise<void>;
}
export interface UberMenuAvailabilityPort {
  syncUberMenuItemAvailability(input: SyncAvailabilityInput): Promise<any>;
  syncUberOptionItemAvailability(
    input: SyncOptionAvailabilityInput,
  ): Promise<any>;
}
export interface UberOrderImportPort {
  processWebhookEvent(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1,
    ordering?: UberEventOrdering,
  ): Promise<void>;
}
export interface UberOrderActionPort {
  acceptUberOrder(id: string): Promise<any>;
  denyUberOrder(
    id: string,
    reasonCode: string,
    reasonDetail?: string,
  ): Promise<any>;
  retryReadyForPickup(id: string): Promise<any>;
  processPendingUberOrderActions(limit?: number): Promise<any>;
  getReadyForPickupAction(id: string): Promise<any>;
}
export interface UberOrderSyncPort {
  syncOrderStatusToUber(id: string, status: UberOrderStatus): Promise<any>;
  listPendingUberOrders(): Promise<any>;
  getPendingUberOrdersSummary(): Promise<any>;
}
export type UberOrderWorkflowPort = UberOrderImportPort &
  UberOrderActionPort &
  UberOrderSyncPort;
