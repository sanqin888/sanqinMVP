import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mapUberStoreDiscoveryWire,
  mapUberStoreProvisionWire,
} from './uber-store-wire.mapper';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/store-wire-mapping', `${name}.json`),
      'utf8',
    ),
  ) as unknown;

const expectMappingFailure = (run: () => unknown, code: string) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code });
};

describe('Uber store wire mapper', () => {
  it('discovery 顶层 stores 不存在时映射失败', () => {
    expectMappingFailure(
      () => mapUberStoreDiscoveryWire(fixture('discovery-missing-stores')),
      'UBER_STORE_DISCOVERY_MAPPING_FAILED',
    );
  });

  it('discovery 数组成员不是 object 时映射失败而非静默过滤', () => {
    expectMappingFailure(
      () => mapUberStoreDiscoveryWire(fixture('discovery-non-object-member')),
      'UBER_STORE_DISCOVERY_MAPPING_FAILED',
    );
  });

  it('discovery 门店缺少 store_id 时映射失败而非生成 unknown', () => {
    expectMappingFailure(
      () => mapUberStoreDiscoveryWire(fixture('discovery-missing-store-id')),
      'UBER_STORE_DISCOVERY_MAPPING_FAILED',
    );
  });

  it.each([null, {}])(
    'provision 成功响应为 %p 或不含 store_id 时使用请求 storeId',
    (response) => {
      expect(mapUberStoreProvisionWire(response, 'store-1')).toEqual({
        storeId: 'store-1',
        status: null,
        storeName: null,
        locationSummary: null,
        posExternalStoreId: null,
      });
    },
  );

  it('只把 integrator_store_id 映射为 SanQ external store identity', () => {
    expect(
      mapUberStoreDiscoveryWire({
        stores: [
          {
            store_id: 'store-1',
            pos_data: {
              integrator_store_id: '4750_Yonge_Street',
              order_manager_client_id: 'must-not-be-used-as-store-id',
            },
          },
        ],
      }),
    ).toMatchObject({
      stores: [{ posExternalStoreId: '4750_Yonge_Street' }],
    });
    expect(
      mapUberStoreProvisionWire(
        {
          pos_data: {
            integrator_store_id: '4750_Yonge_Street',
            order_manager_client_id: 'must-not-be-used-as-store-id',
          },
        },
        'store-1',
      ),
    ).toMatchObject({ posExternalStoreId: '4750_Yonge_Street' });
  });

  it('明确应用可选字段默认值并忽略未知字段', () => {
    expect(
      mapUberStoreDiscoveryWire({
        stores: [{ store_id: ' store-1 ', ignored: 'value' }],
      }),
    ).toEqual({
      stores: [
        {
          storeId: 'store-1',
          storeName: null,
          locationSummary: null,
          integrationEnabled: false,
          posExternalStoreId: null,
          timezone: null,
        },
      ],
    });
    expect(
      mapUberStoreProvisionWire(
        { store_id: 'wrong-response-id', ignored: 'value' },
        'store-1',
      ),
    ).toEqual({
      storeId: 'store-1',
      status: null,
      storeName: null,
      locationSummary: null,
      posExternalStoreId: null,
    });
  });
});
