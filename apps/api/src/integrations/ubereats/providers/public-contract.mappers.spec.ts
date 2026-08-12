import { presentAvailabilitySync } from './public-contract.mappers';

describe('public contract mappers', () => {
  it.each(['PENDING', 'SYNCED'] as const)(
    'maps the internal %s availability state to SYNC_REQUESTED',
    (status) => {
      expect(
        presentAvailabilitySync({
          status,
          stores: [
            {
              storeId: 'store-1',
              uberStoreId: 'uber-store-1',
              status,
            },
          ],
        }),
      ).toEqual({
        status: 'SYNC_REQUESTED',
        stores: [{ storeId: 'store-1', status: 'SYNC_REQUESTED' }],
      });
    },
  );

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
