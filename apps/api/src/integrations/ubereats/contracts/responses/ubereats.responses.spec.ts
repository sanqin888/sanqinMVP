import {
  toUberListResponse,
  toUberMutationResponse,
  toUberPublicError,
  executeUberMutation,
} from './ubereats.responses';
import fixture from '../../test/fixtures/public-response-contract.json';

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

  it('redacts thrown upstream failures', async () => {
    const response = await executeUberMutation(() => {
      throw new Error('token=secret payload={private} upstream stack');
    });
    expect(response.status).toBe('FAILED');
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(response.error).toMatchObject({
      code: 'UBER_OPERATION_FAILED',
      retryable: true,
    });
  });
});
