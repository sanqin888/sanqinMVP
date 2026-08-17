import { presentAvailabilitySync } from './public-contract.mapper';

describe('public contract mappers', () => {
  it('maps an internal PENDING availability state to SYNC_REQUESTED', () => {
    expect(
      presentAvailabilitySync({
        status: 'PENDING',
        stores: [
          {
            storeId: 'store-1',
            uberStoreId: 'uber-store-1',
            status: 'PENDING',
          },
        ],
      }),
    ).toEqual({
      status: 'SYNC_REQUESTED',
      stores: [{ storeId: 'store-1', status: 'SYNC_REQUESTED' }],
    });
  });

  it('preserves an internal SYNCED availability state', () => {
    expect(
      presentAvailabilitySync({
        status: 'SYNCED',
        stores: [
          {
            storeId: 'store-1',
            uberStoreId: 'uber-store-1',
            status: 'SYNCED',
          },
        ],
      }),
    ).toEqual({
      status: 'SYNCED',
      stores: [{ storeId: 'store-1', status: 'SYNCED' }],
    });
  });

  it('maps an internal failure without leaking integration-only fields', () => {
    expect(
      presentAvailabilitySync({
        status: 'FAILED',
        stores: [
          {
            storeId: 'store-1',
            uberStoreId: 'uber-store-1',
            status: 'FAILED',
            versionStableId: 'version-1',
            error: 'upstream unavailable',
          },
        ],
      }),
    ).toEqual({
      status: 'FAILED',
      stores: [
        {
          storeId: 'store-1',
          status: 'FAILED',
          error: {
            code: 'UNKNOWN',
            message: 'upstream unavailable',
            retryable: true,
          },
        },
      ],
    });
  });
});
