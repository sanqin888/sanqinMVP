import {
  ExecuteUberOrderActionWorker,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import { UberOrderActionService } from './uber-order-action.service';

describe('Uber order use-case boundaries', () => {
  it('requests an ACCEPT durable intent', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ taskId: 'task-1', created: true });
    const useCase = new RequestUberOrderActionUseCase({
      request,
    } as unknown as UberOrderActionService);
    await expect(useCase.accept('order-1')).resolves.toMatchObject({
      actionId: 'task-1',
      status: 'PENDING',
      duplicate: false,
    });
    expect(request).toHaveBeenCalledWith('order-1', 'ACCEPT');
  });

  it('delegates lease processing to the action service', async () => {
    const process = jest.fn().mockResolvedValue(2);
    const worker = new ExecuteUberOrderActionWorker({
      process,
    } as unknown as UberOrderActionService);
    await expect(worker.execute(50)).resolves.toBe(2);
    expect(process).toHaveBeenCalledWith(50, expect.stringMatching(/^worker-/));
  });
});
