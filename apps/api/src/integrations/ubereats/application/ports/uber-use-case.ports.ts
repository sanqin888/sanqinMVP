import type { UberOrderNotificationEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import type { UberEventOrdering } from './uber-order-processing.ports';
import type {
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
  UberAvailabilitySyncResult,
} from '../../domain/menu/uber-menu.types';

export const UBER_MENU_AVAILABILITY_PORT = Symbol(
  'UBER_MENU_AVAILABILITY_PORT',
);
export const UBER_ORDER_IMPORT_PORT = Symbol('UBER_ORDER_IMPORT_PORT');
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
