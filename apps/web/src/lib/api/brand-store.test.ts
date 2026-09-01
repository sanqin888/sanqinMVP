import {
  fetchStaffStoreConfig,
  fetchStaffStoreHolidays,
  fetchStaffStoreHours,
  updateAdminStoreConfig,
  updateAdminStoreHolidays,
  updateAdminStoreHours,
} from './brand-store';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('Brand/Store staff API adapter', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it(
    'requires explicit storeStableId routes for Store config, hours, and holidays',
    async () => {
      for (let index = 0; index < 6; index += 1) {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ code: 'OK', message: 'success', details: {} }),
        );
      }

      await fetchStaffStoreConfig('store_b');
      await updateAdminStoreConfig(
        { timezone: 'America/Vancouver' },
        'store_b',
      );
      await fetchStaffStoreHours('store_b');
      await updateAdminStoreHours([], 'store_b');
      await fetchStaffStoreHolidays('store_b');
      await updateAdminStoreHolidays([], 'store_b');

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/v1/staff/stores/store_b/config',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/v1/staff/stores/store_b/config',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        '/api/v1/staff/stores/store_b/hours',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        '/api/v1/staff/stores/store_b/hours',
        expect.objectContaining({ method: 'PUT' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        '/api/v1/staff/stores/store_b/holidays',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        '/api/v1/staff/stores/store_b/holidays',
        expect.objectContaining({ method: 'PUT' }),
      );
    },
  );
});
