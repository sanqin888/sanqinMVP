jest.mock('./ubereats-access.decorator', () => ({
  UberReadOnlyAdmin: () => () => undefined,
}));

import { UberEatsWebhookController } from './webhook.controller';

const request = (body: Buffer = Buffer.from('{}')) =>
  ({ body, headers: {} }) as never;

describe('UberEatsWebhookController durable acknowledgement boundary', () => {
  it('does not return the 200 response value before inbox commit resolves', async () => {
    let commit!: () => void;
    const execute = jest.fn(
      () => new Promise<void>((resolve) => (commit = resolve)),
    );
    const controller = new UberEatsWebhookController({ execute } as never);
    let responded = false;
    const response = controller.webhook(request()).then((value) => {
      responded = true;
      return value;
    });

    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(responded).toBe(false);

    commit();
    await expect(response).resolves.toEqual({ ok: true });
  });

  it('propagates inbox persistence failure instead of returning success', async () => {
    const failure = new Error('database unavailable');
    const controller = new UberEatsWebhookController({
      execute: jest.fn().mockRejectedValue(failure),
    } as never);

    await expect(controller.webhook(request())).rejects.toBe(failure);
  });

  it('does not invoke a business handler after durable enqueue succeeds', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = jest.fn().mockRejectedValue(new Error('handler timeout'));
    const controller = new UberEatsWebhookController({ execute } as never);

    await expect(controller.webhook(request())).resolves.toEqual({ ok: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
