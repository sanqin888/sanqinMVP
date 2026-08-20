import { ReplayUnsupportedUberWebhooksUseCase } from './replay-unsupported-uber-webhooks.use-case';

describe('ReplayUnsupportedUberWebhooksUseCase', () => {
  it('去重选中项，并只按当前 1.0.0 contract 支持列表重新排队', async () => {
    const inbox = {
      requeueUnsupported: jest.fn().mockResolvedValue(1),
    };
    const useCase = new ReplayUnsupportedUberWebhooksUseCase(inbox as never);

    await expect(useCase.execute([' evt-1 ', 'evt-1', ''])).resolves.toBe(1);

    expect(inbox.requeueUnsupported).toHaveBeenCalledWith(
      ['evt-1'],
      [
        'orders.notification',
        'orders.scheduled.notification',
        'orders.failure',
        'menus.notification',
        'store.provisioned',
        'store.deprovisioned',
      ],
      'v1',
    );
  });
});
