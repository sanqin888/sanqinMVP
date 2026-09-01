import {
  POS_PRINT_JOB_DISPATCH_REQUESTED,
  type PosPrintJobDispatchRequest,
} from '../orders/public-api';
import { PosPrintDispatchListener } from './pos-print-dispatch.listener';

describe('PosPrintDispatchListener', () => {
  it('forwards the Orders-owned dispatch request to PosGateway unchanged', async () => {
    const request: PosPrintJobDispatchRequest = {
      orderId: 'order-db-id',
      orderStableId: 'c123456789012345678901234',
      storeId: '4750_Yonge_Street',
      kind: 'AUTO',
      data: { targets: { customer: true, kitchen: true } },
    };
    const sendPrintJob = jest.fn().mockResolvedValue({ jobId: 'job-1' });
    const listener = new PosPrintDispatchListener({ sendPrintJob } as never);

    await expect(listener.dispatch(request)).resolves.toEqual({ jobId: 'job-1' });
    expect(sendPrintJob).toHaveBeenCalledWith(request);
    expect(POS_PRINT_JOB_DISPATCH_REQUESTED).toBe(
      'orders.pos-print-job.dispatch-requested',
    );
  });
});
