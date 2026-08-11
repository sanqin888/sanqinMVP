import { type UberWebhookInboxPort } from '../ports/uber-order-processing.ports';

/** Administrator operation used only after the deployed contract supports a quarantined type. */
export class ReplayUnsupportedUberWebhooksUseCase {
  private static readonly BUSINESS_VERSION = 'v1';
  private static readonly SUPPORTED_EVENT_TYPES = [
    'orders.notification',
    'orders.accepted',
    'orders.in_progress',
    'orders.making',
    'orders.ready_for_pickup',
    'orders.completed',
    'orders.cancelled',
    'orders.cancel',
    'orders.rejected',
    'menus.notification',
    'store.provisioned',
    'store.deprovisioned',
    'store.status.changed',
  ];

  constructor(private readonly inbox: UberWebhookInboxPort) {}

  execute(eventIds: string[]): Promise<number> {
    const selected = [
      ...new Set(eventIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!selected.length) return Promise.resolve(0);
    return this.inbox.requeueUnsupported(
      selected,
      ReplayUnsupportedUberWebhooksUseCase.SUPPORTED_EVENT_TYPES,
      ReplayUnsupportedUberWebhooksUseCase.BUSINESS_VERSION,
    );
  }
}
