import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { UberHttpClient, UberApiError } from './uber-http.client';
import { UberApiGatewayTransport } from './uber-api.gateway';
import { UberApiConfigService } from './uber-api-config.service';
import { UberMerchantApiAdapter } from './uber-merchant-api.adapter';
import { UberMenuGatewayAdapter } from './uber-menu-publication.adapter';
import { UberOrderActionGatewayAdapter } from './uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';
import {
  UberAuthService,
  type UberAuthConfigPort,
  type UberAuthHttpPort,
} from './uber-token.provider';
import {
  type UberTelemetryPort,
  UBER_TELEMETRY_PORT,
} from '../../application/shared/uber-telemetry.port';
import type { UberGatewayAuditPort } from '../../application/shared/uber-gateway-audit.port';
import {
  createUberTransportFake,
  uberHttpResult,
} from '../../test/uber-api-test.helpers';
import {
  UberMenuGateway,
  UberMerchantResourceGateway,
  UberOrderGateway,
  UberStoreGateway,
} from './uber-resource.gateways';

const fixtureRoot = join(__dirname, '../../test/fixtures/uber-contract/v1');
const audit: UberGatewayAuditPort = {
  recordResponse: () => Promise.resolve(),
};
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fixture = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(
    readFileSync(join(fixtureRoot, path), 'utf8'),
  );
  if (!isJsonObject(value)) throw new Error(`Expected object fixture: ${path}`);
  return value;
};

describe('Uber gateways wire contract v1', () => {
  it('resolves the order gateway transport and configuration through Nest tokens', async () => {
    const module = await Test.createTestingModule({
      providers: [
        UberOrderGateway,
        {
          provide: UberApiGatewayTransport,
          useValue: createUberTransportFake(),
        },
        {
          provide: UberApiConfigService,
          useValue: { resourceHrefAllowedOrigins: 'https://api.uber.com' },
        },
      ],
    }).compile();

    expect(module.get(UberOrderGateway)).toBeInstanceOf(UberOrderGateway);
  });

  it('resolves the order detail adapter telemetry dependency through its Nest token', async () => {
    const module = await Test.createTestingModule({
      providers: [
        UberOrderDetailGatewayAdapter,
        { provide: UberOrderGateway, useValue: {} },
        { provide: UBER_TELEMETRY_PORT, useValue: { workflowLog: jest.fn() } },
      ],
    }).compile();

    expect(module.get(UberOrderDetailGatewayAdapter)).toBeInstanceOf(
      UberOrderDetailGatewayAdapter,
    );
  });

  it('OAuth client credentials request fixes method, content type, grant and scope', async () => {
    const http: jest.Mocked<UberAuthHttpPort> = {
      request: jest.fn<UberAuthHttpPort['request']>().mockResolvedValue({
        response: new Response(
          JSON.stringify(fixture('oauth/token-success.json')),
        ),
        data: fixture('oauth/token-success.json'),
      }),
    };
    const auth = new UberAuthService(http, {
      clientId: 'fixture-client-id',
      clientSecret: 'fixture-client-secret',
      defaultAppScopes: 'eats.store eats.order',
      tokenEndpoint: 'https://auth.uber.com/oauth/v2/token',
    } satisfies UberAuthConfigPort);
    await expect(auth.getAccessToken('eats.store eats.order')).resolves.toBe(
      'fixture-not-a-real-token',
    );
    const request = http.request.mock.calls[0][0];
    expect(request).toMatchObject({
      url: 'https://auth.uber.com/oauth/v2/token',
      method: 'POST',
      kind: 'token',
      returnErrorResponse: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(new URLSearchParams(request.body).entries()).toEqual(
      expect.anything(),
    );
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      client_id: 'fixture-client-id',
      client_secret: 'fixture-client-secret',
      grant_type: 'client_credentials',
      scope: 'eats.store eats.order',
    });
  });

  it('discovery and provisioning own their Uber wire paths, scope and body', async () => {
    const transport = createUberTransportFake();
    transport.request
      .mockResolvedValueOnce(fixture('stores/discovery.json'))
      .mockResolvedValueOnce(fixture('stores/provision-response.json'));
    const credentials = {
      loadCredential: jest.fn().mockResolvedValue({
        merchantUberUserId: 'merchant-1',
        accessToken: 'fixture-merchant-token',
        refreshToken: null,
        expiresAt: new Date(Date.now() + 3600_000),
        scope: 'eats.store',
        tokenType: 'Bearer',
        version: 'v1',
      }),
      rotateCredential: jest.fn(),
    };
    const adapter = new UberMerchantApiAdapter(
      transport,
      credentials,
      {} as UberAuthService,
      audit,
    );

    await adapter.discoverStores({ merchantUberUserId: 'merchant-1' });
    await adapter.provisionStore(
      { merchantUberUserId: 'merchant-1' },
      'store / 1',
      fixture('stores/provision-request.json'),
      'provision:store-1:v1',
    );

    expect(transport.request.mock.calls.map(([request]) => request)).toEqual([
      {
        path: '/v1/eats/stores',
        method: 'GET',
        operation: 'GET /v1/eats/stores',
        scope: 'eats.store',
        accessToken: 'fixture-merchant-token',
        json: undefined,
      },
      {
        path: '/v1/eats/stores/store%20%2F%201/pos_data',
        method: 'POST',
        operation: 'POST /v1/eats/stores/store%20%2F%201/pos_data',
        scope: 'eats.store',
        accessToken: 'fixture-merchant-token',
        json: fixture('stores/provision-request.json'),
        idempotencyKey: 'provision:store-1:v1',
      },
    ]);
  });

  it('store status has a write scope and stable idempotency key', async () => {
    const transport = createUberTransportFake();
    transport.inspect.mockResolvedValue(uberHttpResult(200));
    const adapter = new UberMerchantApiAdapter(
      transport,
      undefined as never,
      undefined as never,
      audit,
    );
    await adapter.writeStatus('store/1', { status: 'ONLINE' }, 'status:key:v1');
    expect(transport.inspect).toHaveBeenCalledWith({
      path: '/v1/eats/stores/store%2F1/status',
      method: 'POST',
      operation: 'uber.store.status',
      scope: 'eats.store.status.write',
      partitionKey: 'store/1',
      json: { status: 'ONLINE' },
      idempotencyKey: 'status:key:v1',
    });
  });

  it('menu upload and confirmation use dedicated wire DTO fixtures', async () => {
    const transport = createUberTransportFake();
    transport.request
      .mockResolvedValueOnce(fixture('menu/upload-response.json'))
      .mockResolvedValueOnce(fixture('menu/confirmation.json'));
    const adapter = new UberMenuGatewayAdapter(transport);
    const wireMenu = fixture('menu/upload-request.json');
    await adapter.uploadMenu({
      storeId: 'store/1',
      payload: wireMenu,
      idempotencyKey: 'menu:store-1:v1',
    });
    await adapter.getMenuPublicationStatus({ storeId: 'store/1' });
    expect(transport.request.mock.calls.map(([value]) => value)).toEqual([
      {
        path: '/v2/eats/stores/store%2F1/menus',
        scope: 'eats.store',
        operation: 'uber.menu.upload',
        partitionKey: 'store/1',
        method: 'PUT',
        json: wireMenu,
        idempotencyKey: 'menu:store-1:v1',
      },
      {
        path: '/v2/eats/stores/store%2F1/menus',
        scope: 'eats.store',
        operation: 'uber.menu.read',
        partitionKey: 'store/1',
        method: 'GET',
      },
    ]);
  });

  it.each([
    ['accept', 'accept_pos_order', 'orders/accept-request.json'],
    ['deny', 'deny_pos_order', 'orders/deny-request.json'],
    ['readyForPickup', 'ready', 'orders/ready-request.json'],
  ] as const)(
    '%s maps domain input to the explicit Uber command wire schema',
    async (method, suffix, bodyFixture) => {
      const sendActionCommand = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200 });
      const adapter = new UberOrderActionGatewayAdapter({
        sendActionCommand,
      });
      const common = {
        externalOrderId: 'order/1',
        idempotencyKey: `${method}:v1`,
      };
      if (method === 'deny')
        await adapter.deny({
          ...common,
          denial: {
            reasonCode: 'ITEM_UNAVAILABLE',
            reasonDetail: 'Synthetic unavailable item',
          },
        });
      else await adapter[method](common);
      const action =
        method === 'accept'
          ? 'ACCEPT'
          : method === 'deny'
            ? 'DENY'
            : 'READY_FOR_PICKUP';
      expect(sendActionCommand).toHaveBeenCalledWith(
        'order/1',
        action,
        fixture(bodyFixture),
        `${method}:v1`,
      );
      expect(suffix).toEqual(expect.any(String));
    },
  );

  it.each([
    ['ACCEPT', '/v1/eats/orders/order%2F1/accept_pos_order'],
    ['DENY', '/v1/eats/orders/order%2F1/deny_pos_order'],
    ['READY_FOR_PICKUP', '/v1/delivery/order/order%2F1/ready'],
  ] as const)(
    'order gateway fixes %s method, escaped path, scope and body',
    async (action, path) => {
      const inspect = jest
        .fn()
        .mockResolvedValue({ response: new Response('{}'), data: {} });
      const gateway = new UberOrderGateway(
        { request: jest.fn(), inspect },
        {
          resourceHrefAllowedOrigins: 'https://api.uber.com',
        },
      );
      await gateway.sendActionCommand('order/1', action, {}, `${action}:v1`);
      expect(inspect).toHaveBeenCalledWith({
        path,
        method: 'POST',
        operation: `uber.order.${action.toLowerCase()}`,
        scope: 'eats.order',
        partitionKey: 'merchant:app',
        json: {},
        idempotencyKey: `${action}:v1`,
      });
    },
  );

  it('order detail is GET-only and maps terminal upstream errors', async () => {
    const gateway = {
      pathFromResourceHref: jest
        .fn()
        .mockResolvedValue('/v2/eats/order/order-1'),
      inspect: jest.fn().mockResolvedValue({
        response: new Response(
          JSON.stringify(fixture('errors/unauthorized.json')),
          { status: 403 },
        ),
        data: fixture('errors/unauthorized.json'),
        text: JSON.stringify(fixture('errors/unauthorized.json')),
      }),
    };
    const adapter = new UberOrderDetailGatewayAdapter(gateway, {
      workflowLog:
        jest.fn<Pick<UberTelemetryPort, 'workflowLog'>['workflowLog']>(),
    });
    await expect(
      adapter.fetchOrderDetail({
        resourceHref: 'https://api.uber.com/v2/eats/order/order-1',
        eventType: 'orders.notification',
        eventId: 'event-1',
        resourceId: 'order-1',
      }),
    ).rejects.toMatchObject({
      code: 'UBER_SCOPE_INSUFFICIENT',
      retryable: false,
    });
    expect(gateway.inspect).toHaveBeenCalledWith({
      path: '/v2/eats/order/order-1',
      method: 'GET',
      operation: 'uber.order.detail',
      scope: 'eats.store.orders.read',
      kind: 'orderDetail',
    });
  });

  it.each([
    ['mapping', 'MISSING_ORDER_ID', { total: 100, items: [{}] }],
    ['business', 'EMPTY_ITEMS', { id: 'order-1', total: 100, items: [] }],
  ] as const)(
    'classifies a successful but invalid order detail as %s/%s without auditing its payload',
    async (category, reason, data) => {
      const credential = 'Bearer super-secret-credential';
      const workflowLog = jest.fn();
      const adapter = new UberOrderDetailGatewayAdapter(
        {
          pathFromResourceHref: jest.fn().mockResolvedValue('/orders/1'),
          inspect: jest.fn().mockResolvedValue({
            response: new Response(null, { status: 200 }),
            data: { ...data, authorization: credential },
            text: JSON.stringify({ ...data, authorization: credential }),
          }),
        },
        { workflowLog },
      );

      await expect(
        adapter.fetchOrderDetail({
          resourceHref: 'https://api.uber.com/orders/1',
          eventType: 'orders.notification',
          eventId: 'event-1',
          resourceId: 'order-1',
        }),
      ).resolves.toEqual({ kind: 'invalid', reason });
      expect(workflowLog).toHaveBeenCalledWith(
        category === 'mapping' ? 'error' : 'warn',
        `[ubereats order] detail invalid category=${category} reason=${reason}`,
      );
      expect(JSON.stringify(workflowLog.mock.calls)).not.toContain(
        'super-secret-credential',
      );
    },
  );

  it('resource gateways reject cross-capability paths before transport', () => {
    const transport = createUberTransportFake();
    for (const gateway of [
      new UberMerchantResourceGateway(transport),
      new UberStoreGateway(transport),
      new UberMenuGateway(transport),
    ]) {
      expect(() =>
        gateway.request({
          path: '/v1/eats/orders/1',
          scope: 'eats.order',
          operation: 'wrong',
        }),
      ).toThrow();
    }
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('Uber HTTP wire headers and error map', () => {
  beforeEach(() => {
    process.env.UBER_EATS_HTTP_MAX_ATTEMPTS = '1';
  });
  afterEach(() => {
    delete process.env.UBER_EATS_HTTP_MAX_ATTEMPTS;
    jest.restoreAllMocks();
  });

  it('sends exact auth/content/idempotency/request headers and serialized JSON', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));
    await new UberHttpClient().request({
      url: 'https://api.uber.com/v1/eats/orders/fixture/accept_pos_order',
      method: 'POST',
      accessToken: 'fixture-not-real',
      idempotencyKey: 'accept:v1',
      headers: { 'X-Request-ID': 'request-v1' },
      json: {},
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.uber.com/v1/eats/orders/fixture/accept_pos_order',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer fixture-not-real',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'accept:v1',
          'X-Request-ID': 'request-v1',
        },
      }),
    );
  });

  it.each([
    [400, 'UBER_INVALID_REQUEST', false],
    [401, 'UBER_ACCESS_TOKEN_INVALID', false],
    [403, 'UBER_SCOPE_INSUFFICIENT', false],
    [429, 'UBER_RATE_LIMITED', true],
    [500, 'UBER_INTERNAL_SERVER_ERROR', true],
  ] as const)(
    'maps HTTP %i without leaking the Uber response',
    async (status, uberCode, retryable) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify(
              fixture(
                status === 400
                  ? 'errors/validation.json'
                  : status === 401 || status === 403
                    ? 'errors/unauthorized.json'
                    : status === 429
                      ? 'errors/rate-limited.json'
                      : 'errors/upstream.json',
              ),
            ),
            { status },
          ),
        );
      const error = await new UberHttpClient()
        .request({
          url: 'https://api.uber.com/v1/eats/stores',
          operation: 'uber.store.list',
        })
        .catch((caught: unknown) => caught as UberApiError);
      expect(error).toMatchObject({
        httpStatus: status,
        uberCode,
        retryable,
        operation: 'uber.store.list',
      });
    },
  );
});
