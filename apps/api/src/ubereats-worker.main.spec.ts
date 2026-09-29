import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleWorkerHealthRequest } from './ubereats-worker.main';
import type {
  UberWorkerHealthService,
  UberWorkerWakeService,
} from './integrations/ubereats/worker';

describe('Uber Eats worker health HTTP semantics', () => {
  const request = (url: string, method = 'GET') =>
    ({ url, method }) as IncomingMessage;

  const response = () => {
    const end = jest.fn();
    const writeHead = jest.fn();
    const res = {
      headersSent: false,
      end,
      writeHead,
    } as unknown as ServerResponse;
    writeHead.mockReturnValue(res);
    return { res, writeHead, end };
  };

  it('keeps /live dependency-free', async () => {
    const readiness = jest.fn();
    const snapshot = jest.fn();
    const health = {
      readiness,
      snapshot,
    } as unknown as UberWorkerHealthService;
    const wake = { wake: jest.fn() } as unknown as UberWorkerWakeService;
    const { res, writeHead, end } = response();

    await handleWorkerHealthRequest(request('/live'), res, health, wake);

    expect(writeHead).toHaveBeenCalledWith(200, {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(end).toHaveBeenCalledWith(JSON.stringify({ status: 'ok' }));
    expect(readiness).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('uses runtime readiness only for /ready', async () => {
    const readiness = jest.fn().mockResolvedValue({
      status: 'not_ready',
      checks: { database: 'failed', scheduler: 'ok' },
      thresholds: { maxPollSilenceMs: 3000, maxInFlightAgeMs: 5000 },
    });
    const snapshot = jest.fn();
    const health = {
      readiness,
      snapshot,
    } as unknown as UberWorkerHealthService;
    const wake = { wake: jest.fn() } as unknown as UberWorkerWakeService;
    const { res, writeHead } = response();

    await handleWorkerHealthRequest(request('/ready'), res, health, wake);

    expect(writeHead).toHaveBeenCalledWith(503, {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(readiness).toHaveBeenCalledTimes(1);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('serves degraded provider telemetry as healthy HTTP while runtime remains ready', async () => {
    const snapshot = jest.fn().mockResolvedValue({
      status: 'degraded',
      readiness: 'ok',
      checks: { database: 'ok', scheduler: 'ok' },
      thresholds: { maxPollSilenceMs: 3000, maxInFlightAgeMs: 5000 },
      degradation: {
        durableFailures: { webhookInbox: 0, orderAction: 1 },
      },
      adapters: {},
    });
    const health = {
      readiness: jest.fn(),
      snapshot,
    } as unknown as UberWorkerHealthService;
    const wake = { wake: jest.fn() } as unknown as UberWorkerWakeService;
    const { res, writeHead } = response();

    await handleWorkerHealthRequest(request('/health'), res, health, wake);

    expect(writeHead).toHaveBeenCalledWith(200, {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('returns 503 from /health for a local runtime failure', async () => {
    const snapshot = jest.fn().mockResolvedValue({
      status: 'unhealthy',
      readiness: 'not_ready',
      checks: { database: 'failed', scheduler: 'ok' },
      thresholds: { maxPollSilenceMs: 3000, maxInFlightAgeMs: 5000 },
      degradation: {
        durableFailures: { webhookInbox: 0, orderAction: 0 },
      },
      adapters: {},
    });
    const health = {
      readiness: jest.fn(),
      snapshot,
    } as unknown as UberWorkerHealthService;
    const wake = { wake: jest.fn() } as unknown as UberWorkerWakeService;
    const { res, writeHead } = response();

    await handleWorkerHealthRequest(request('/health'), res, health, wake);

    expect(writeHead).toHaveBeenCalledWith(503, {
      'content-type': 'application/json; charset=utf-8',
    });
  });
});
