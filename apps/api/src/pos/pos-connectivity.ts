export const POS_CONNECTIVITY_HEARTBEAT_META_KEY = 'connectivityHeartbeatV1';
export const DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS = 90_000;
export const DEFAULT_POS_CONNECTIVITY_RECOVERY_STABLE_MS = 30_000;
export const DEFAULT_POS_CONNECTIVITY_WATCH_INTERVAL_MS = 15_000;

export type PosConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export function isPosConnectivityHeartbeatEnabled(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (
    (meta as Record<string, unknown>)[POS_CONNECTIVITY_HEARTBEAT_META_KEY] ===
    true
  );
}

export function withPosConnectivityHeartbeatEnabled(
  meta: unknown,
): Record<string, unknown> {
  const current =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  current[POS_CONNECTIVITY_HEARTBEAT_META_KEY] = true;
  return current;
}

export function readPositiveDurationMs(
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function resolvePosConnectivityStatus(
  devices: Array<{ lastSeenAt: Date | null; meta: unknown }>,
  nowMs = Date.now(),
  offlineAfterMs = DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
): { status: PosConnectivityStatus; lastHeartbeatAt: Date | null } {
  const heartbeatDevices = devices.filter((device) =>
    isPosConnectivityHeartbeatEnabled(device.meta),
  );
  if (!heartbeatDevices.length) {
    return { status: 'UNKNOWN', lastHeartbeatAt: null };
  }

  const latest = heartbeatDevices.reduce<Date | null>((current, device) => {
    if (!device.lastSeenAt) return current;
    if (!current || device.lastSeenAt > current) return device.lastSeenAt;
    return current;
  }, null);

  if (!latest) return { status: 'OFFLINE', lastHeartbeatAt: null };
  return {
    status: nowMs - latest.getTime() > offlineAfterMs ? 'OFFLINE' : 'ONLINE',
    lastHeartbeatAt: latest,
  };
}
