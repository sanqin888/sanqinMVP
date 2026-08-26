jest.mock('./ubereats-access.decorator', () => ({
  UberReadOnlyAdmin: () => () => undefined,
}));

import { UberEatsWebhookController } from './webhook.controller';

const request = (body: unknown = Buffer.from('{}')) =>
  ({ body, headers: {} }) as never;

const response = () => {
  const res = {
    status: jest.fn(),
    end: jest.fn((body?: string | Buffer) => body),
    json: jest.fn((body: unknown) => body),
    sendStatus: jest.fn((status: number) => status),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('UberEatsWebhookController durable acknowledgement boundary', () => {
  it('keeps GET health JSON and HEAD 200 behavior unchanged', () => {
    const controller = new UberEatsWebhookController({
      execute: jest.fn(),
    } as never);
    const healthResponse = response();
    const headResponse = response();

    controller.health(healthResponse as never);
    controller.head(headResponse as never);

    expect(healthResponse.status).toHaveBeenCalledWith(200);
    expect(healthResponse.json).toHaveBeenCalledWith({ ok: true });
    expect(headResponse.sendStatus).toHaveBeenCalledWith(200);
  });

  it('does not send the 200 acknowledgement before inbox commit resolves', async () => {
    let commit!: () => void;
    const execute = jest.fn(
      () => new Promise<void>((resolve) => (commit = resolve)),
    );
    const controller = new UberEatsWebhookController({ execute } as never);
    const res = response();
    let responded = false;
    const acknowledgement = controller
      .webhook(request(), res as never)
      .then((value) => {
        responded = true;
        return value;
      });

    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(responded).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();

    commit();
    await acknowledgement;
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.end).toHaveBeenCalledWith();
    const responseBody = res.end.mock.calls[0]?.[0];
    expect(responseBody).toBeUndefined();
    expect(Buffer.byteLength(String(responseBody ?? ''))).toBe(0);
  });

  it('propagates inbox persistence failure instead of returning success', async () => {
    const failure = new Error('database unavailable');
    const controller = new UberEatsWebhookController({
      execute: jest.fn().mockRejectedValue(failure),
    } as never);
    const res = response();

    await expect(controller.webhook(request(), res as never)).rejects.toBe(failure);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('does not invoke a business handler after durable enqueue succeeds', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const handler = jest.fn().mockRejectedValue(new Error('handler timeout'));
    const controller = new UberEatsWebhookController({ execute } as never);
    const res = response();

    await controller.webhook(request(), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith();
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a request when the raw body buffer is unavailable', async () => {
    const execute = jest.fn();
    const controller = new UberEatsWebhookController({ execute } as never);
    const res = response();

    await expect(
      controller.webhook(request({ parsed: true }), res as never),
    ).rejects.toMatchObject({ code: 'UBER_WEBHOOK_RAW_BODY_REQUIRED' });
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
