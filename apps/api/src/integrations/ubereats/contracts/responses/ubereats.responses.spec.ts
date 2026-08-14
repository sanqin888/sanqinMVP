import {
  toUberListResponse,
  toUberMutationResponse,
  toUberPublicError,
} from './ubereats.responses';
import fixture from '../../test/fixtures/public-response-contract.json';
import {
  presentMerchantConnection,
  presentMerchantStores,
} from '../../api/merchant.presenter';
import { presentMenuList } from '../../api/menu.presenter';
import { presentPendingOrders } from '../../api/orders.presenter';
import { presentOpsTickets } from '../../api/operations.presenter';

describe('Uber Eats public response contracts', () => {
  it('uses items and pageInfo for every list', () => {
    expect(toUberListResponse([{ id: 'one' }], 20)).toEqual({
      items: [{ id: 'one' }],
      pageInfo: { limit: 20, count: 1, hasNextPage: false, nextCursor: null },
      contractVersion: '2',
    });
  });

  it('returns operation metadata without internal results', () => {
    const response = toUberMutationResponse('ACCEPTED', 'op-1');
    expect(response).toEqual({
      operationId: 'op-1',
      status: 'ACCEPTED',
      error: null,
      contractVersion: '2',
    });
    expect(response).not.toHaveProperty('payload');
    expect(response).not.toHaveProperty('token');
  });

  it('only exposes safe error fields', () => {
    expect(
      toUberPublicError('UBER_TEMPORARY', '请稍后重试', true, 'cid-1'),
    ).toEqual({
      code: 'UBER_TEMPORARY',
      message: '请稍后重试',
      retryable: true,
      correlationId: 'cid-1',
    });
  });

  it('matches the dependency-free public contract fixture', () => {
    const list = toUberListResponse([], 20) as unknown as Record<
      string,
      unknown
    >;
    const mutation = toUberMutationResponse(
      'SUCCEEDED',
      'op-1',
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(list).sort()).toEqual([...fixture.list].sort());
    expect(Object.keys(list.pageInfo as object).sort()).toEqual(
      [...fixture.pageInfo].sort(),
    );
    expect(Object.keys(mutation).sort()).toEqual([...fixture.mutation].sort());
    expect(
      Object.keys(toUberPublicError('CODE', 'safe', false, 'cid')).sort(),
    ).toEqual([...fixture.error].sort());
    for (const forbidden of fixture.forbidden) {
      expect(JSON.stringify({ list, mutation })).not.toContain(
        `"${forbidden}"`,
      );
    }
  });

  it('locks domain response field allowlists even when internal fixtures grow', () => {
    const internal = {
      token: 'secret',
      payload: { private: true },
      lastError: 'private',
      repositoryOnly: 42,
    };
    const store = presentMerchantStores({
      connectionId: 'm1',
      stores: [
        {
          ...internal,
          storeId: 's1',
          storeName: 'Store',
          integrationEnabled: true,
          isProvisioned: true,
        },
      ],
    }).stores[0];
    const connection = presentMerchantConnection({
      ...internal,
      connectionId: 'm1',
      scope: 'eats.store',
      tokenType: 'bearer',
      connectedAt: new Date(0),
    });
    const menuItem = presentMenuList({
      items: [
        {
          ...internal,
          menuItemStableId: 'i1',
          priceCents: 100,
          isAvailable: true,
        },
      ],
    }).items[0];
    const order = presentPendingOrders({
      items: [{ ...internal, externalOrderId: 'o1', status: 'PENDING' }],
    }).items[0];
    const ticket = presentOpsTickets({
      items: [
        {
          ...internal,
          ticketStableId: 't1',
          type: 'ORDER',
          status: 'OPEN',
          priority: 'HIGH',
          title: 'Help',
          retryCount: 0,
        },
      ],
    }).items[0];
    expect(Object.keys(store).sort()).toEqual(
      [...fixture.merchantStore].sort(),
    );
    expect(Object.keys(connection).sort()).toEqual(
      [...fixture.merchantConnection].sort(),
    );
    expect(Object.keys(menuItem).sort()).toEqual([...fixture.menuItem].sort());
    expect(Object.keys(order).sort()).toEqual([...fixture.pendingOrder].sort());
    expect(Object.keys(ticket).sort()).toEqual([...fixture.opsTicket].sort());
    expect(
      JSON.stringify({ store, connection, menuItem, order, ticket }),
    ).not.toContain('secret');
    expect(
      JSON.stringify({ store, connection, menuItem, order, ticket }),
    ).not.toContain('repositoryOnly');
  });
});
