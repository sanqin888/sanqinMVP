import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberOrderNotificationEventV1 } from '../../contracts/events/uber-order-notification.v1';
import type { UberEventOrdering } from './uber-order-processing.ports';
import type {
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
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
