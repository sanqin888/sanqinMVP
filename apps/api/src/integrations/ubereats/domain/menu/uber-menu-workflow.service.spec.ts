import {
  decideMenuPayload,
  mergeMenuAvailability,
} from './uber-menu-workflow.service';

describe('Uber menu workflow domain service', () => {
  it('merges availability without mutating the snapshot', () => {
    const snapshot = {
      categories: [],
      items: [
        {
          stableId: 'i',
          categoryStableId: 'c',
          name: 'Item',
          priceCents: 1,
          isAvailable: true,
        },
      ],
    };
    const result = mergeMenuAvailability(snapshot, [
      {
        stableId: 'i',
        isAvailable: false,
      },
    ]);
    expect(result.items[0].isAvailable).toBe(false);
    expect(snapshot.items[0].isAvailable).toBe(true);
  });
  it('makes deterministic payload decisions', () => {
    expect(decideMenuPayload('hash', 'hash')).toEqual({
      kind: 'skip',
      reason: 'UNCHANGED',
    });
    expect(decideMenuPayload('new', 'old')).toEqual({
      kind: 'upload',
      payloadHash: 'new',
    });
  });
});
