/** Canonical representation used to route Uber webhook event types. */
export function normalizeUberEventType(eventType: string): string {
  return eventType.trim().toLowerCase();
}
