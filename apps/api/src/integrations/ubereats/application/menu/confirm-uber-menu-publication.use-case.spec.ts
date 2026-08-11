import { ConfirmUberMenuPublicationUseCase } from './confirm-uber-menu-publication.use-case';

const lease = (token = 'lease-current') => ({
  attemptId: 'attempt-1',
  storeId: 'uber-store',
  idempotencyKey: 'key',
  businessVersion: 'version-1',
  status: 'SUBMITTED' as const,
  uberRequestId: null,
  uberResourceId: 'resource-1',
  leaseToken: token,
});

describe('ConfirmUberMenuPublicationUseCase', () => {
  it('PENDING 会携带 lease token 释放租约并延后重试', async () => {
    const repository = {
      claimDueConfirmations: jest.fn().mockResolvedValue([lease()]),
      rescheduleConfirmation: jest.fn().mockResolvedValue(true),
      markConfirmed: jest.fn(),
    };
    const gateway = {
      getMenuPublicationStatus: jest
        .fn()
        .mockResolvedValue({ status: 'PENDING' }),
    };
    const useCase = new ConfirmUberMenuPublicationUseCase(
      repository as never,
      gateway as never,
    );
    await useCase.execute();
    expect(repository.rescheduleConfirmation).toHaveBeenCalledWith(
      'attempt-1',
      'lease-current',
      expect.any(Date),
    );
    expect(repository.markConfirmed).not.toHaveBeenCalled();
  });

  it.each(['SUCCEEDED', 'FAILED'] as const)(
    '%s 终态携带 lease token 幂等写回',
    async (status) => {
      const repository = {
        claimDueConfirmations: jest.fn().mockResolvedValue([lease()]),
        rescheduleConfirmation: jest.fn(),
        markConfirmed: jest.fn().mockResolvedValue(false), // expired lease/terminal duplicate
      };
      const result = {
        status,
        uberRequestId: 'request-1',
        uberResourceId: 'resource-1',
        errorCode: null,
        errorMessage: null,
      };
      const gateway = {
        getMenuPublicationStatus: jest.fn().mockResolvedValue(result),
      };
      const useCase = new ConfirmUberMenuPublicationUseCase(
        repository as never,
        gateway as never,
      );
      await expect(useCase.execute()).resolves.toBe(1);
      expect(repository.markConfirmed).toHaveBeenCalledWith(
        'attempt-1',
        'lease-current',
        result,
      );
    },
  );

  it('并发 worker 只能处理 claim 返回给自己的记录', async () => {
    const repository = {
      claimDueConfirmations: jest
        .fn()
        .mockResolvedValueOnce([lease('winner')])
        .mockResolvedValueOnce([]),
      markConfirmed: jest.fn().mockResolvedValue(true),
      rescheduleConfirmation: jest.fn(),
    };
    const gateway = {
      getMenuPublicationStatus: jest.fn().mockResolvedValue({
        status: 'SUCCEEDED',
        uberRequestId: null,
        errorCode: null,
        errorMessage: null,
      }),
    };
    const useCase = new ConfirmUberMenuPublicationUseCase(
      repository as never,
      gateway as never,
    );
    await Promise.all([
      useCase.execute(20, 'worker-a'),
      useCase.execute(20, 'worker-b'),
    ]);
    expect(gateway.getMenuPublicationStatus).toHaveBeenCalledTimes(1);
    expect(repository.markConfirmed).toHaveBeenCalledTimes(1);
  });
});
