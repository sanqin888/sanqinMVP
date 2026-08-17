import { ConfirmUberMenuPublicationUseCase } from './confirm-uber-menu-publication.use-case';

const lease = (token = 'lease-current') => ({
  attemptId: 'attempt-1',
  storeId: 'pos-store',
  idempotencyKey: 'key',
  businessVersion: 'version-1',
  status: 'SUBMITTED' as const,
  uberRequestId: null,
  uberResourceId: null,
  leaseToken: token,
});

describe('ConfirmUberMenuPublicationUseCase', () => {
  it('将旧版 204 后遗留的 SUBMITTED 记录关闭为 SUCCEEDED', async () => {
    const repository = {
      claimDueConfirmations: jest.fn().mockResolvedValue([lease()]),
      markConfirmed: jest.fn().mockResolvedValue(true),
    };
    const useCase = new ConfirmUberMenuPublicationUseCase(repository as never);

    await expect(useCase.execute()).resolves.toBe(1);
    expect(repository.markConfirmed).toHaveBeenCalledWith(
      'attempt-1',
      'lease-current',
      {
        status: 'SUCCEEDED',
        uberRequestId: null,
        uberResourceId: null,
        errorCode: null,
        errorMessage: null,
      },
    );
  });

  it('保留旧记录已有的 Uber request/resource id', async () => {
    const repository = {
      claimDueConfirmations: jest.fn().mockResolvedValue([
        {
          ...lease(),
          uberRequestId: 'request-1',
          uberResourceId: 'resource-1',
        },
      ]),
      markConfirmed: jest.fn().mockResolvedValue(true),
    };
    const useCase = new ConfirmUberMenuPublicationUseCase(repository as never);

    await useCase.execute();
    expect(repository.markConfirmed).toHaveBeenCalledWith(
      'attempt-1',
      'lease-current',
      expect.objectContaining({
        status: 'SUCCEEDED',
        uberRequestId: 'request-1',
        uberResourceId: 'resource-1',
      }),
    );
  });

  it('并发 worker 只能处理 claim 返回给自己的记录', async () => {
    const repository = {
      claimDueConfirmations: jest
        .fn()
        .mockResolvedValueOnce([lease('winner')])
        .mockResolvedValueOnce([]),
      markConfirmed: jest.fn().mockResolvedValue(true),
    };
    const useCase = new ConfirmUberMenuPublicationUseCase(repository as never);

    await Promise.all([
      useCase.execute(20, 'worker-a'),
      useCase.execute(20, 'worker-b'),
    ]);
    expect(repository.markConfirmed).toHaveBeenCalledTimes(1);
  });
});
