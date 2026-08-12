/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- mocked fetch and JSON fixtures deliberately enter through the wire boundary */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UberHttpClient, UberApiError } from './uber-http.client';
import { UberMerchantApiAdapter } from './uber-merchant-api.adapter';
import { UberMenuGatewayAdapter } from './uber-menu-publication.adapter';
import { UberOrderActionGatewayAdapter } from './uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from './uber-order-detail.gateway';
import { UberAuthService } from './uber-token.provider';
import {
  UberMenuGateway,
  UberMerchantResourceGateway,
  UberOrderGateway,
  UberStoreGateway,
} from './uber-resource.gateways';

const fixtureRoot = join(__dirname, '../../test/fixtures/uber-contract/v1');
const fixture = (path: string) =>
  JSON.parse(readFileSync(join(fixtureRoot, path), 'utf8')) as Record<
    string,
    unknown
  >;

describe('Uber gateways wire contract v1', () => {
  it('OAuth client credentials request fixes method, content type, grant and scope', async () => {
    const http = {
      request: jest.fn().mockResolvedValue({
        response: new Response(
          JSON.stringify(fixture('oauth/token-success.json')),
        ),
        data: fixture('oauth/token-success.json'),
      }),
    };
    const auth = new UberAuthService(
      http as never,
      {
        clientId: 'fixture-client-id',
        clientSecret: 'fixture-client-secret',
        defaultAppScopes: 'eats.store eats.order',
        tokenEndpoint: 'https://auth.uber.com/oauth/v2/token',
      } as never,
    );
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
    const transport = { request: jest.fn() };
    transport.request
      .mockResolvedValueOnce(fixture('stores/discovery.json'))
      .mockResolvedValueOnce(fixture('stores/provision-response.json'));
    const adapter = new UberMerchantApiAdapter(transport as never);

    await adapter.discoverStores('fixture-merchant-token');
    await adapter.provisionStore(
      'fixture-merchant-token',
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
    const transport = {
      inspect: jest.fn().mockResolvedValue({
        response: new Response('{}', { status: 200 }),
        data: {},
        text: '{}',
      }),
    };
    const adapter = new UberMerchantApiAdapter(transport as never);
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
    const request = jest
      .fn()
      .mockResolvedValueOnce(fixture('menu/upload-response.json'))
      .mockResolvedValueOnce(fixture('menu/confirmation.json'));
    const adapter = new UberMenuGatewayAdapter({ request } as never);
    const wireMenu = fixture('menu/upload-request.json');
    await adapter.uploadMenu({
      storeId: 'store/1',
      payload: wireMenu,
      idempotencyKey: 'menu:store-1:v1',
    } as never);
    await adapter.getMenuPublicationStatus({ storeId: 'store/1' });
    expect(request.mock.calls.map(([value]) => value)).toEqual([
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
      const executeAction = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200 });
      const adapter = new UberOrderActionGatewayAdapter({
        executeAction,
      } as never);
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
      expect(executeAction).toHaveBeenCalledWith(
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
      const gateway = new UberOrderGateway({ inspect } as never, {
        resourceHrefAllowedOrigins: 'https://api.uber.com',
      });
      await gateway.executeAction('order/1', action, {}, `${action}:v1`);
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
    const adapter = new UberOrderDetailGatewayAdapter(
      gateway as never,
      { workflowLog: jest.fn() } as never,
    );
    await expect(
      adapter.fetchOrderDetail({
        resourceHref: 'https://api.uber.com/v2/eats/order/order-1',
        eventType: 'orders.notification',
        eventId: 'event-1',
        resourceId: 'order-1',
      }),
    ).rejects.toMatchObject({
      code: 'UBER_ORDER_DETAIL_HTTP_403',
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

  it('resource gateways reject cross-capability paths before transport', async () => {
    const transport = { request: jest.fn() };
    for (const gateway of [
      new UberMerchantResourceGateway(transport as never),
      new UberStoreGateway(transport as never),
      new UberMenuGateway(transport as never),
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
