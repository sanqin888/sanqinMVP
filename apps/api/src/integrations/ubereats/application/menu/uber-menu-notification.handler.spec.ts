import { UberMenuNotificationHandler } from './uber-menu-notification.handler';

describe('UberMenuNotificationHandler', () => {
  it('未知 correlation 安全忽略', async () => {
    const repository = {
      findByCorrelation: jest.fn().mockResolvedValue(null),
      apply: jest.fn(),
    };
    const handler = new UberMenuNotificationHandler(repository);
    await expect(
      handler.handle({ resourceId: 'unknown', status: 'SUCCEEDED' }),
    ).resolves.toEqual({ kind: 'ignored', reason: 'unknown_publication' });
    expect(repository.apply).not.toHaveBeenCalled();
  });

  it('重复 webhook 始终按同一不可变 resourceId 关联，由 repository 幂等应用', async () => {
    const repository = {
      findByCorrelation: jest.fn().mockResolvedValue({ id: 'version-1' }),
      apply: jest.fn(),
    };
    const handler = new UberMenuNotificationHandler(repository);
    const event = { resourceId: 'resource-1', status: 'SUCCEEDED' };
    await handler.handle(event);
    await handler.handle(event);
    expect(repository.findByCorrelation).toHaveBeenNthCalledWith(1, {
      publishVersion: null,
      resourceId: 'resource-1',
    });
    expect(repository.apply).toHaveBeenCalledTimes(2);
    expect(repository.apply).toHaveBeenCalledWith('version-1', event);
  });
});
