import { resolveConfiguredStoreId } from './store-id';

describe('resolveConfiguredStoreId', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = originalStoreId;
  });

  it('uses the cloud printer room ID as the single-store default', () => {
    delete process.env.STORE_ID;

    expect(resolveConfiguredStoreId()).toBe('4750_Yonge_Street');
  });

  it('uses a trimmed server-controlled STORE_ID when configured', () => {
    process.env.STORE_ID = '  configured-store  ';

    expect(resolveConfiguredStoreId()).toBe('configured-store');
  });
});
