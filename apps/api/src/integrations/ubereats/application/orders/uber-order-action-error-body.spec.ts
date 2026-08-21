import { UberOrderActionService } from './uber-order-action.service';
import type {
  UberOrderActionGatewayPort,
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
} from './uber-order.ports';

const task: UberOrderActionTask = {
  taskId: 'task-1',
  leaseToken: 'lease-1',
  externalOrderId: 'order-1',
  action: 'READY_FOR_PICKUP',
  idempotencyKey: 'ready-key',
  businessVersion: 'v1',
  reasonCode: null,
  reasonDetail: null,
};

describe('Uber order action failure diagnostics', () => {
  it('persists upstream status and safe response body when an action fails', async () => {
    const markFailed = jest.fn().mockResolvedValue(true);
    const repository = {
      enqueue: jest.fn(),
      claim: jest.fn(),
      getOrderContext: jest.fn().mockResolvedValue({
        status: 'making',
        totalCents: 367,
        referenceAt: new Date('2026-08-20T22:32:20.000Z'),
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-08-21T00:23:26.000Z'),
        externalEstimatedReadyAt: new Date('2026-08-21T00:23:26.000Z'),
      }),
      complete: jest.fn(),
      markFailed,
    } as unknown as UberOrderActionRepositoryPort;
    const error = Object.assign(new Error('Uber order command failed with HTTP 400'), {
      status: 400,
      code: 'UBER_ORDER_HTTP_400',
      responseBody: {
        code: 'bad_request',
        message: 'order is not eligible to be marked ready',
        metadata: { should_retry: false },
      },
    });
    const gateway = {
      accept: jest.fn(),
      deny: jest.fn(),
      cancel: jest.fn(),
      readyForPickup: jest.fn().mockRejectedValue(error),
    } as unknown as UberOrderActionGatewayPort;

    await new UberOrderActionService(repository, gateway).executeClaimed(task);

    expect(markFailed).toHaveBeenCalledWith('task-1', 'lease-1', {
      retryable: false,
      code: 'UBER_ORDER_HTTP_400',
      message: 'Uber order command failed with HTTP 400',
      upstreamStatus: 400,
      responseBody: {
        code: 'bad_request',
        message: 'order is not eligible to be marked ready',
        metadata: { should_retry: false },
      },
    });
  });
});