import { UberWorkerWakeService } from './uber-worker-wake.service';

describe('UberWorkerWakeService', () => {
  it('routes each wake target to only its matching worker adapter', () => {
    const webhookInbox = { wake: jest.fn().mockReturnValue(true) };
    const orderAction = { wake: jest.fn().mockReturnValue(true) };
    const service = new UberWorkerWakeService(
      webhookInbox as never,
      orderAction as never,
    );

    expect(service.wake('webhookInbox')).toBe(true);
    expect(webhookInbox.wake).toHaveBeenCalledTimes(1);
    expect(orderAction.wake).not.toHaveBeenCalled();

    expect(service.wake('orderAction')).toBe(true);
    expect(orderAction.wake).toHaveBeenCalledTimes(1);
  });
});
