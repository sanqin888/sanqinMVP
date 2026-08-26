import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { PosGateway } from './pos.gateway';

type PosSocketMiddleware = (
  client: Socket,
  next: (error?: Error) => void,
) => void;

const activeDevice = {
  id: 'device-db-1',
  deviceStableId: 'device-1',
  deviceKeyHash: 'hash',
  status: 'ACTIVE',
  storeId: 'store-db-a',
  storeStableId: 'store-a',
  meta: null,
};

function makeSocket(input?: {
  cookie?: string;
  auth?: Record<string, unknown>;
  deviceStableId?: string;
  storeId?: string;
}) {
  return {
    id: 'socket-1',
    handshake: {
      headers: { cookie: input?.cookie },
      auth: input?.auth ?? {},
    },
    data:
      input?.deviceStableId && input.storeId
        ? {
            posDevice: {
              deviceStableId: input.deviceStableId,
              storeStableId: input.storeId,
            },
          }
        : {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
  } as unknown as Socket;
}

function setup(deviceResult: typeof activeDevice | null = activeDevice) {
  const verifyDevice = jest.fn().mockResolvedValue(deviceResult);
  const posPrintJob = {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };
  const gateway = new PosGateway(
    { posPrintJob } as never,
    { verifyDevice } as never,
  );
  let middleware: PosSocketMiddleware | undefined;
  gateway.afterInit({
    use: jest.fn((candidate: PosSocketMiddleware) => {
      middleware = candidate;
    }),
  } as never);
  if (!middleware) throw new Error('POS socket middleware was not registered');
  return { gateway, middleware, verifyDevice, posPrintJob };
}

function runMiddleware(
  middleware: PosSocketMiddleware,
  client: Socket,
): Promise<Error | undefined> {
  return new Promise((resolve) => middleware(client, resolve));
}

describe('PosGateway device authorization', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('authenticates browser POS and maps the device store UUID to the stable POS room id', async () => {
    const { middleware, verifyDevice } = setup();
    const client = makeSocket({
      cookie: 'other=value; posDeviceId=device-1; posDeviceKey=secret%2Bkey',
    });

    await expect(runMiddleware(middleware, client)).resolves.toBeUndefined();
    expect(verifyDevice).toHaveBeenCalledWith({
      deviceStableId: 'device-1',
      deviceKey: 'secret+key',
    });
    expect(client.data).toEqual({
      posDevice: { deviceStableId: 'device-1', storeStableId: 'store-a' },
    });
    expect(client.data).not.toHaveProperty('posDeviceKey');
  });

  it('authenticates printer Socket.IO credentials', async () => {
    const { middleware, verifyDevice } = setup();
    const client = makeSocket({
      auth: { posDeviceId: 'printer-1', posDeviceKey: 'printer-secret' },
    });

    await expect(runMiddleware(middleware, client)).resolves.toBeUndefined();
    expect(verifyDevice).toHaveBeenCalledWith({
      deviceStableId: 'printer-1',
      deviceKey: 'printer-secret',
    });
    expect(client.data).toEqual({
      posDevice: { deviceStableId: 'device-1', storeStableId: 'store-a' },
    });
  });

  it('keeps printer auth, join and ACK on one device context', async () => {
    const { gateway, middleware, posPrintJob } = setup();
    const client = makeSocket({
      auth: { posDeviceId: 'printer-1', posDeviceKey: 'printer-secret' },
    });
    const job = {
      jobId: 'job-printer-1',
      orderStableId: 'order-stable-1',
      storeId: 'store-a',
      customerAttempts: 1,
      kitchenAttempts: 0,
    };
    posPrintJob.findUnique.mockResolvedValue(job);
    posPrintJob.update.mockResolvedValue(job);

    await expect(runMiddleware(middleware, client)).resolves.toBeUndefined();
    await gateway.handleJoinStore(client);
    await gateway.handlePrintJobAck(client, {
      jobId: 'job-printer-1',
      target: 'customer',
      success: true,
    });

    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).toHaveBeenCalledWith('store:store-a');
    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: 'job-printer-1' },
        data: expect.objectContaining({
          customerStatus: 'COMPLETED',
        }) as unknown,
      }),
    );
  });

  it('rejects missing credentials before room membership', async () => {
    const { middleware, verifyDevice } = setup();
    const client = makeSocket();

    const error = await runMiddleware(middleware, client);

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('POS_DEVICE_AUTH_FAILED');
    expect(verifyDevice).not.toHaveBeenCalled();
    expect(client.data).toEqual({});
  });

  it('rejects invalid or inactive device credentials', async () => {
    const { middleware, verifyDevice } = setup(null);
    const client = makeSocket({
      auth: { posDeviceId: 'device-disabled', posDeviceKey: 'bad-or-revoked' },
    });

    const error = await runMiddleware(middleware, client);

    expect(error?.message).toBe('POS_DEVICE_AUTH_FAILED');
    expect(verifyDevice).toHaveBeenCalledTimes(1);
    expect(client.data).toEqual({});
  });

  it('joins the authoritative store and dispatches pending jobs', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket({
      deviceStableId: 'device-1',
      storeId: 'store-a',
    });

    await gateway.handleJoinStore(client, { storeId: 'store-a' });

    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).toHaveBeenCalledWith('store:store-a');
    expect(
      (client as unknown as { emit: jest.Mock }).emit,
    ).toHaveBeenCalledWith('joined', { room: 'store:store-a' });
    expect(posPrintJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-a' }) as unknown,
      }),
    );
  });

  it('rejects a cross-store join without calling socket.join', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket({
      deviceStableId: 'device-1',
      storeId: 'store-a',
    });

    await gateway.handleJoinStore(client, { storeId: 'store-b' });

    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).not.toHaveBeenCalled();
    expect(posPrintJob.findMany).not.toHaveBeenCalled();
  });

  it('allows joinStore without client storeId and resolves the room from device identity', async () => {
    const { gateway } = setup();
    const client = makeSocket({
      deviceStableId: 'device-1',
      storeId: 'store-a',
    });

    await gateway.handleJoinStore(client);

    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).toHaveBeenCalledWith('store:store-a');
  });

  it('keeps anonymous sockets out of printer online detection', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket();
    const roomMembers = new Set<Socket>();
    (client as unknown as { join: jest.Mock }).join.mockImplementation(() => {
      roomMembers.add(client);
      return Promise.resolve(undefined);
    });
    const emit = jest.fn();
    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest
          .fn()
          .mockImplementation(() => Promise.resolve([...roomMembers])),
      }),
      to: jest.fn().mockReturnValue({ emit }),
    } as never;
    const job = {
      jobId: 'job-offline-1',
      orderStableId: 'order-stable-1',
      storeId: 'store-a',
      customerRequested: true,
      customerStatus: 'PENDING',
      customerAttempts: 0,
      customerFailureReason: null,
    };
    posPrintJob.findUnique.mockResolvedValue(job);
    posPrintJob.update.mockResolvedValue(job);

    await gateway.handleJoinStore(client, { storeId: 'store-a' });
    await (
      gateway as unknown as {
        dispatchTarget(jobId: string, target: 'customer'): Promise<void>;
      }
    ).dispatchTarget('job-offline-1', 'customer');

    expect(
      (client as unknown as { join: jest.Mock }).join,
    ).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerFailureReason: 'CLIENT_OFFLINE',
        }) as unknown,
      }),
    );
  });

  it('accepts PRINT_JOB_ACK only from the job store device', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket({
      deviceStableId: 'device-1',
      storeId: 'store-a',
    });
    const job = {
      jobId: 'job-1',
      orderStableId: 'order-stable-1',
      storeId: 'store-a',
      customerAttempts: 1,
      kitchenAttempts: 0,
    };
    posPrintJob.findUnique.mockResolvedValue(job);
    posPrintJob.update.mockResolvedValue(job);

    await gateway.handlePrintJobAck(client, {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });

    expect(posPrintJob.findUnique).toHaveBeenCalledWith({
      where: { jobId: 'job-1' },
    });
    expect(posPrintJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: 'job-1' },
        data: expect.objectContaining({
          customerStatus: 'COMPLETED',
        }) as unknown,
      }),
    );
  });

  it('rejects an anonymous PRINT_JOB_ACK before reading or mutating the job', async () => {
    const { gateway, posPrintJob } = setup();

    await gateway.handlePrintJobAck(makeSocket(), {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });

    expect(posPrintJob.findUnique).not.toHaveBeenCalled();
    expect(posPrintJob.update).not.toHaveBeenCalled();
  });

  it('rejects a cross-store PRINT_JOB_ACK without mutating the job', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket({
      deviceStableId: 'device-b',
      storeId: 'store-b',
    });
    posPrintJob.findUnique.mockResolvedValue({
      jobId: 'job-1',
      storeId: 'store-a',
    });

    await gateway.handlePrintJobAck(client, {
      jobId: 'job-1',
      target: 'customer',
      success: true,
    });

    expect(posPrintJob.update).not.toHaveBeenCalled();
  });

  it('handles an unknown PRINT_JOB_ACK jobId as a safe rejection', async () => {
    const { gateway, posPrintJob } = setup();
    const client = makeSocket({
      deviceStableId: 'device-1',
      storeId: 'store-a',
    });
    posPrintJob.findUnique.mockResolvedValue(null);

    await gateway.handlePrintJobAck(client, {
      jobId: 'missing-job',
      target: 'kitchen',
      success: true,
    });

    expect(posPrintJob.update).not.toHaveBeenCalled();
  });

  it('publishes payment status only to the requested authenticated store room', () => {
    const { gateway } = setup();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.publishCardPaymentStatus('store-a', {
      attemptId: 'attempt-1',
      paymentId: 'payment-1',
      status: 'SUCCEEDED',
    });

    expect(to).toHaveBeenCalledWith('store:store-a');
    expect(emit).toHaveBeenCalledWith(
      'POS_CARD_PAYMENT_STATUS_UPDATED',
      expect.objectContaining({ attemptId: 'attempt-1', status: 'SUCCEEDED' }),
    );
  });
});
