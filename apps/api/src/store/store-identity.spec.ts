import { resolveConfiguredStoreStableId } from './public-api';

describe('resolveConfiguredStoreStableId', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = originalStoreId;
  });

  it('uses the stable single-store identity as the deployment default', () => {
    delete process.env.STORE_ID;

    expect(resolveConfiguredStoreStableId()).toBe('4750_Yonge_Street');
  });

  it('uses a trimmed server-controlled STORE_ID when configured', () => {
    process.env.STORE_ID = '  configured-store  ';

    expect(resolveConfiguredStoreStableId()).toBe('configured-store');
  });
});
