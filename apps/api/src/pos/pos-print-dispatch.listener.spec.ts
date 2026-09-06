import {
  ORDER_PRINT_HANDOFF_REQUESTED,
  type OrderPrintHandoffRequest,
} from '../orders/public-api';
import { PosPrintDispatchListener } from './pos-print-dispatch.listener';

describe('PosPrintDispatchListener', () => {
  it('forwards the Orders-owned print intent to the Print owner unchanged', async () => {
    const request: OrderPrintHandoffRequest = {
      orderId: 'order-db-id',
      orderStableId: 'c123456789012345678901234',
      storeStableId: '4750_Yonge_Street',
      purpose: 'INITIAL',
      data: { orderNumber: '1001' },
    };
    const enqueuePrintHandoff = jest
      .fn()
      .mockResolvedValue({ jobId: 'job-1' });
    const listener = new PosPrintDispatchListener({ enqueuePrintHandoff } as never);

    await expect(listener.dispatch(request)).resolves.toEqual({
      jobId: 'job-1',
    });
    expect(enqueuePrintHandoff).toHaveBeenCalledWith(request);
    expect(ORDER_PRINT_HANDOFF_REQUESTED).toBe('orders.print-handoff.requested');
  });
});
