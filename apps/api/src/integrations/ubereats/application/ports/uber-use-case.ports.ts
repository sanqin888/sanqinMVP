import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import type { UberEventOrdering } from './uber-order-processing.ports';
import type {
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
  UberAvailabilitySyncResult,
  UpdateDraftGroupInput,
  UpdateDraftItemInput,
  UpdateDraftOptionInput,
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';

export const UBER_MENU_DRAFT_PORT = Symbol('UBER_MENU_DRAFT_PORT');
export const UBER_MENU_AVAILABILITY_PORT = Symbol(
  'UBER_MENU_AVAILABILITY_PORT',
);
export const UBER_ORDER_IMPORT_PORT = Symbol('UBER_ORDER_IMPORT_PORT');
export interface UberMenuDraftPort {
  listUberItemChannelConfigs(storeId?: string): Promise<unknown>;
  listUberPublishedMenuItems(storeId?: string): Promise<unknown>;
  listUberOptionItemConfigs(storeId?: string): Promise<unknown>;
  upsertUberItemChannelConfig(
    input: UpsertPriceBookItemInput,
  ): Promise<unknown>;
  upsertUberOptionItemConfig(
    input: UpsertOptionItemConfigInput,
  ): Promise<unknown>;
  getUberMenuDraft(storeId?: string): Promise<unknown>;
  updateUberDraftItem(
    id: string,
    input: UpdateDraftItemInput,
  ): Promise<unknown>;
  updateUberDraftGroup(
    id: string,
    input: UpdateDraftGroupInput,
  ): Promise<unknown>;
  updateUberDraftOption(
    id: string,
    input: UpdateDraftOptionInput,
  ): Promise<unknown>;
  bindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<unknown>;
  unbindUberDraftOptionChildGroup(
    optionId: string,
    childGroupId: string,
    storeId?: string,
  ): Promise<unknown>;
  getUberMenuDraftDiff(storeId?: string): Promise<unknown>;
}
export interface UberMenuAvailabilityPort {
  syncUberMenuItemAvailability(
    input: SyncAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult>;
  syncUberOptionItemAvailability(
    input: SyncOptionAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult>;
}
export interface UberOrderImportPort {
  processWebhookEvent(
    eventType: string,
    eventId: string,
    payload: UberOrderNotificationEventV1,
    ordering?: UberEventOrdering,
  ): Promise<void>;
}
