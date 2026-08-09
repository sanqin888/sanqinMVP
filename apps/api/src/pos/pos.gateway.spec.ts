import { Logger } from '@nestjs/common';
import { PosGateway } from './pos.gateway';

describe('PosGateway durable print delivery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
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
      job,
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
    expect(baseJob.customerAttempts).toBe(0);
    expect(posPrintJob.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerAttempts: { increment: 1 },
        }) as unknown,
      }),
    );

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

  it('ACK 超时后只重试超时目标并保留超时原因', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { gateway, posPrintJob, emit } = setup();

    await (
      gateway as unknown as {
        markTimeoutAndRetry(
          jobId: string,
          target: 'customer' | 'kitchen',
        ): Promise<void>;
      }
    ).markTimeoutAndRetry('job-1', 'customer');

    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerStatus: 'FAILED',
          customerFailureReason: 'ACK_TIMEOUT',
        }) as unknown,
      }),
    );
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'customer' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pos_print_ack_timeout',
        reason: 'ACK_TIMEOUT',
      }),
    );
  });

  it('达到真实发送上限后停止重试并可由 REPRINT 新建任务恢复', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { gateway, job, posPrintJob, emit } = setup();
    job.customerAttempts = 3;
    job.customerFailureReason = 'ACK_TIMEOUT';

    await (
      gateway as unknown as {
        dispatchTarget(
          jobId: string,
          target: 'customer' | 'kitchen',
        ): Promise<void>;
      }
    ).dispatchTarget('job-1', 'customer');
    expect(emit).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pos_print_retry_stopped',
        reason: 'MAX_SEND_ATTEMPTS_REACHED',
      }),
    );

    await gateway.sendPrintJob({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeId: 'store-1',
      kind: 'REPRINT:manual-1',
      data: baseJob.payload,
    });
    expect(posPrintJob.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          orderStableId_kind: {
            orderStableId: 'stable-1',
            kind: 'REPRINT:manual-1',
          },
        },
      }),
    );
  });

  it('旧版离线耗尽次数的任务在客户端上线后重置并恢复投递', async () => {
    const { gateway, job, posPrintJob, emit } = setup();
    job.customerAttempts = 3;
    job.customerFailureReason = 'CLIENT_OFFLINE';

    await (
      gateway as unknown as {
        dispatchTarget(
          jobId: string,
          target: 'customer' | 'kitchen',
        ): Promise<void>;
      }
    ).dispatchTarget('job-1', 'customer');

    expect(posPrintJob.update).toHaveBeenCalledWith({
      where: { jobId: 'job-1' },
      data: { customerAttempts: 0, customerStatus: 'PENDING' },
    });
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'customer' }),
    );
  });

  it('查询订单打印状态时返回最新任务且兼容店内 REPRINT 任务', async () => {
    const { gateway, posPrintJob } = setup();

    await gateway.getOrderPrintStatus('stable-1');

    expect(posPrintJob.findFirst).toHaveBeenCalledWith({
      where: { orderStableId: 'stable-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
