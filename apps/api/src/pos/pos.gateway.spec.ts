import { PosGateway } from './pos.gateway';

describe('PosGateway durable print delivery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  const baseJob = {
    jobId: 'job-1',
    orderId: 'order-1',
    orderStableId: 'stable-1',
    storeId: 'store-1',
    kind: 'AUTO',
    payload: { targets: { customer: true, kitchen: true } },
    customerRequested: true,
    kitchenRequested: true,
    customerStatus: 'PENDING',
    kitchenStatus: 'PENDING',
    customerAttempts: 0,
    kitchenAttempts: 0,
    customerFailureReason: null,
    kitchenFailureReason: null,
    createdAt: new Date(),
  };

  function setup(connected = true) {
    const job: Record<string, unknown> = { ...baseJob };
    const emit = jest.fn();
    const posPrintJob = {
      upsert: jest.fn().mockImplementation(() => Promise.resolve(job)),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(job)),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([job])),
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(job)),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
        for (const [key, value] of Object.entries(
          data as Record<string, unknown>,
        )) {
          const currentValue = job[key];
          job[key] =
            value !== null &&
            typeof value === 'object' &&
            'increment' in value &&
            typeof value.increment === 'number' &&
            typeof currentValue === 'number'
              ? currentValue + value.increment
              : value;
        }
        return Promise.resolve(job);
      }),
    };
    const gateway = new PosGateway({ posPrintJob } as never);
    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest
          .fn()
          .mockImplementation(() => Promise.resolve(connected ? [{}] : [])),
      }),
      to: jest.fn().mockReturnValue({ emit }),
    } as never;
    return {
      gateway,
      posPrintJob,
      emit,
      setConnected: (value: boolean) => {
        connected = value;
      },
    };
  }

  it('重复自动任务只 upsert 同一业务键并显式投递双目标', async () => {
    const { gateway, posPrintJob, emit } = setup();
    const input = {
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeId: 'store-1',
      kind: 'AUTO',
      data: baseJob.payload,
    };
    await gateway.sendPrintJob(input);
    await gateway.sendPrintJob(input);

    expect(posPrintJob.upsert).toHaveBeenCalledTimes(2);
    expect(posPrintJob.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          orderStableId_kind: { orderStableId: 'stable-1', kind: 'AUTO' },
        },
        create: expect.objectContaining({
          customerRequested: true,
          kitchenRequested: true,
        }) as unknown,
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'customer' }),
    );
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'kitchen' }),
    );
  });

  it('离线记录原因，joinStore 重连后补发未完成目标', async () => {
    const { gateway, posPrintJob, emit, setConnected } = setup(false);
    await gateway.sendPrintJob({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeId: 'store-1',
      kind: 'AUTO',
      data: baseJob.payload,
    });
    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerFailureReason: 'CLIENT_OFFLINE',
        }) as unknown,
      }),
    );
    expect(emit).not.toHaveBeenCalled();

    setConnected(true);
    await (
      gateway as unknown as { dispatchPending(storeId: string): Promise<void> }
    ).dispatchPending('store-1');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('单个打印机失败时只重试该目标，成功 ACK 才标记完成', async () => {
    const { gateway, posPrintJob, emit } = setup();
    await gateway.handlePrintJobAck({} as never, {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });
    await gateway.handlePrintJobAck({} as never, {
      jobId: 'job-1',
      target: 'kitchen',
      success: false,
      error: 'paper jam',
    });

    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerStatus: 'COMPLETED',
        }) as unknown,
      }),
    );
    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kitchenFailureReason: 'paper jam',
        }) as unknown,
      }),
    );
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'kitchen' }),
    );
  });
});
