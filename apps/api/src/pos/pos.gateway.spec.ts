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
    labelRequested: false,
    customerStatus: 'PENDING',
    kitchenStatus: 'PENDING',
    labelStatus: 'SKIPPED',
    customerAttempts: 0,
    kitchenAttempts: 0,
    labelAttempts: 0,
    customerFailureReason: null,
    kitchenFailureReason: null,
    labelFailureReason: null,
    createdAt: new Date(),
  };

  function setup(connected = true) {
    const job: Record<string, unknown> = { ...baseJob };
    const emit = jest.fn();
    const queryRaw = jest.fn().mockResolvedValue([{ jobId: 'job-1' }]);
    const posPrintJob = {
      upsert: jest.fn().mockImplementation(() => Promise.resolve(job)),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(job)),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([job])),
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(job)),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    let transactionQueue: Promise<unknown> = Promise.resolve();
    const transaction = jest.fn((work: (tx: unknown) => Promise<unknown>) => {
      const run = transactionQueue.then(() =>
        work({ posPrintJob, $queryRaw: queryRaw }),
      );
      transactionQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    const gateway = new PosGateway(
      { posPrintJob, $transaction: transaction } as never,
      { verifyCredentials: jest.fn() } as never,
    );
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
      queryRaw,
      transaction,
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
      storeStableId: 'store-1',
      purpose: 'INITIAL' as const,
      data: baseJob.payload,
    };
    await gateway.enqueuePrintHandoff(input);
    await gateway.enqueuePrintHandoff(input);

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
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('并发 INITIAL handoff 通过数据库行锁只发送一次每个目标', async () => {
    const { gateway, queryRaw, emit } = setup();
    const input = {
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeStableId: 'store-1',
      purpose: 'INITIAL' as const,
      data: baseJob.payload,
    };

    await Promise.all([
      gateway.enqueuePrintHandoff(input),
      gateway.enqueuePrintHandoff(input),
    ]);

    expect(queryRaw).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(2);
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
    await gateway.enqueuePrintHandoff({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeStableId: 'store-1',
      purpose: 'INITIAL',
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

  it('重连扫描把超时 DELIVERED 恢复为 FAILED 后再进入持久重试', async () => {
    const { gateway, posPrintJob } = setup();
    posPrintJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    posPrintJob.findMany.mockResolvedValueOnce([]);

    await (
      gateway as unknown as { dispatchPending(storeId: string): Promise<void> }
    ).dispatchPending('store-1');

    expect(posPrintJob.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          customerRequested: true,
          customerStatus: 'DELIVERED',
          customerAttempts: { lt: 3 },
          updatedAt: { lte: expect.any(Date) as unknown },
        }) as unknown,
        data: {
          customerStatus: 'FAILED',
          customerFailureReason: 'ACK_TIMEOUT',
        },
      }),
    );
  });

  it('单个打印机失败时只重试该目标，成功 ACK 才标记完成', async () => {
    const { gateway, posPrintJob, emit } = setup();
    const client = {
      id: 'socket-1',
      data: {
        posDevice: {
          deviceStableId: 'device-1',
          storeStableId: 'store-1',
          name: 'Front POS',
        },
      },
    } as never;
    await gateway.handlePrintJobAck(client, {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });
    await gateway.handlePrintJobAck(client, {
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

  it('COMPLETED 是终态，迟到失败 ACK 和 timeout 都不能回退状态', async () => {
    const { gateway, job, posPrintJob, emit } = setup();
    const client = {
      id: 'socket-1',
      data: {
        posDevice: {
          deviceStableId: 'device-1',
          storeStableId: 'store-1',
          name: 'Front POS',
        },
      },
    } as never;
    job.customerStatus = 'DELIVERED';
    job.customerAttempts = 1;

    await gateway.handlePrintJobAck(client, {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });
    const updateCountAfterSuccess = posPrintJob.update.mock.calls.length;

    await gateway.handlePrintJobAck(client, {
      jobId: 'job-1',
      target: 'customer',
      success: false,
      error: 'late failure',
    });
    await (
      gateway as unknown as {
        markTimeoutAndRetry(
          jobId: string,
          target: 'customer' | 'kitchen',
        ): Promise<void>;
      }
    ).markTimeoutAndRetry('job-1', 'customer');

    expect(job.customerStatus).toBe('COMPLETED');
    expect(posPrintJob.update).toHaveBeenCalledTimes(updateCountAfterSuccess);
    expect(emit).not.toHaveBeenCalled();
  });

  it('ACK 超时后只重试超时目标并保留超时原因', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { gateway, job, posPrintJob, emit } = setup();
    job.customerStatus = 'DELIVERED';
    job.customerAttempts = 1;

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

    await gateway.enqueuePrintHandoff({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeStableId: 'store-1',
      purpose: 'REPRINT',
      requestedTargets: { customer: true },
      data: baseJob.payload,
    });
    const reprintUpsert = (
      posPrintJob.upsert.mock.calls as Array<
        [
          {
            where: {
              orderStableId_kind: { orderStableId: string; kind: string };
            };
          },
        ]
      >
    ).at(-1)?.[0];
    expect(reprintUpsert).toBeDefined();
    if (!reprintUpsert) throw new Error('reprint upsert missing');
    expect(reprintUpsert.where.orderStableId_kind.orderStableId).toBe(
      'stable-1',
    );
    expect(reprintUpsert.where.orderStableId_kind.kind).toMatch(/^REPRINT:/);
  });

  it('AMENDMENT 的 job identity 与 kitchen routing 由 Print owner 生成', async () => {
    const { gateway, posPrintJob } = setup();

    await gateway.enqueuePrintHandoff({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeStableId: 'store-1',
      purpose: 'AMENDMENT',
      data: baseJob.payload,
    });

    const amendmentUpsert = (
      posPrintJob.upsert.mock.calls as Array<
        [
          {
            where: { orderStableId_kind: { kind: string } };
            create: {
              customerRequested: boolean;
              kitchenRequested: boolean;
              labelRequested: boolean;
            };
          },
        ]
      >
    ).at(-1)?.[0];
    expect(amendmentUpsert).toBeDefined();
    if (!amendmentUpsert) throw new Error('amendment upsert missing');
    expect(amendmentUpsert.where.orderStableId_kind.kind).toMatch(
      /^AMENDMENT:/,
    );
    expect(amendmentUpsert.create).toEqual(
      expect.objectContaining({
        customerRequested: false,
        kitchenRequested: true,
        labelRequested: false,
      }),
    );
  });

  it('AMENDMENT 标签差额非空时同时请求 label target', async () => {
    const { gateway, posPrintJob } = setup();

    await gateway.enqueuePrintHandoff({
      orderId: 'order-1',
      orderStableId: 'stable-1',
      storeStableId: 'store-1',
      purpose: 'AMENDMENT',
      data: {
        ...baseJob.payload,
        labelPlan: { labels: [{ productStableId: 'item-added', copies: 1 }] },
      },
    });

    expect(posPrintJob.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          customerRequested: false,
          kitchenRequested: true,
          labelRequested: true,
        }) as unknown,
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

  it('pending dispatch 不统计或重复处理已达到真实发送上限的任务', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { gateway, job, emit } = setup();
    job.customerStatus = 'FAILED';
    job.customerAttempts = 3;
    job.customerFailureReason = 'ACK_TIMEOUT';
    job.kitchenRequested = false;
    job.kitchenStatus = 'SKIPPED';

    await (
      gateway as unknown as { dispatchPending(storeId: string): Promise<void> }
    ).dispatchPending('store-1');

    expect(emit).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'pos_print_pending_dispatch',
        jobCount: 0,
      }),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pos_print_retry_stopped' }),
    );
  });

  it('pending dispatch 保留仍可发送的目标但跳过同任务中已耗尽的目标', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { gateway, job, emit } = setup();
    job.customerStatus = 'FAILED';
    job.customerAttempts = 3;
    job.customerFailureReason = 'ACK_TIMEOUT';
    job.kitchenStatus = 'PENDING';
    job.kitchenAttempts = 0;

    await (
      gateway as unknown as { dispatchPending(storeId: string): Promise<void> }
    ).dispatchPending('store-1');

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'PRINT_JOB',
      expect.objectContaining({ target: 'kitchen' }),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pos_print_retry_stopped' }),
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
