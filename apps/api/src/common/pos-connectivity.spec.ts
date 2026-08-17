import {
  POS_CONNECTIVITY_HEARTBEAT_META_KEY,
  resolvePosConnectivityStatus,
  withPosConnectivityHeartbeatEnabled,
} from './pos-connectivity';

describe('POS connectivity', () => {
  it('fails open until a device sends the new heartbeat capability marker', () => {
    expect(
      resolvePosConnectivityStatus(
        [{ lastSeenAt: new Date(0), meta: {} }],
        100_000,
        1_000,
      ),
    ).toEqual({ status: 'UNKNOWN', lastHeartbeatAt: null });
  });

  it('reports offline only after the heartbeat grace window expires', () => {
    const lastHeartbeatAt = new Date(10_000);
    const meta = { [POS_CONNECTIVITY_HEARTBEAT_META_KEY]: true };

    expect(
      resolvePosConnectivityStatus(
        [{ lastSeenAt: lastHeartbeatAt, meta }],
        10_900,
        1_000,
      ).status,
    ).toBe('ONLINE');
    expect(
      resolvePosConnectivityStatus(
        [{ lastSeenAt: lastHeartbeatAt, meta }],
        11_001,
        1_000,
      ).status,
    ).toBe('OFFLINE');
  });

  it('preserves existing device metadata when enabling heartbeat protection', () => {
    expect(withPosConnectivityHeartbeatEnabled({ userAgent: 'POS' })).toEqual({
      userAgent: 'POS',
      connectivityHeartbeatV1: true,
    });
  });
});
