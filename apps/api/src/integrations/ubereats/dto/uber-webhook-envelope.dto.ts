export class UberWebhookEnvelopeDto {
  private constructor(
    readonly eventType: string,
    readonly resourceHref: string,
    readonly resourceId: string,
    readonly userId: string,
    readonly eventId: string | null,
  ) {}

  static parse(payload: unknown): UberWebhookEnvelopeDto | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const root = payload as Record<string, unknown>;
    const meta =
      root.meta && typeof root.meta === 'object' && !Array.isArray(root.meta)
        ? (root.meta as Record<string, unknown>)
        : null;
    const read = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    const eventType = read(root.event_type);
    const resourceHref = read(root.resource_href);
    const resourceId = read(meta?.resource_id);
    const userId = read(meta?.user_id);

    if (!eventType || !resourceHref || !resourceId || !userId) return null;

    return new UberWebhookEnvelopeDto(
      eventType,
      resourceHref,
      resourceId,
      userId,
      read(root.event_id) ?? read(root.id),
    );
  }
}
