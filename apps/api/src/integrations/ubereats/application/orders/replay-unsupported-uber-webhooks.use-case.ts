import { type UberWebhookInboxPort } from './uber-order-processing.ports';

/** Administrator operation used only after the deployed contract supports a quarantined type. */
export class ReplayUnsupportedUberWebhooksUseCase {
  private static readonly BUSINESS_VERSION = 'v1';
  private static readonly SUPPORTED_EVENT_TYPES = [
    'orders.notification',
    'orders.scheduled.notification',
    'orders.failure',
    'menus.notification',
    'store.provisioned',
    'store.deprovisioned',
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
