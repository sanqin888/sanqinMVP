import type { Response } from 'express';

import { RuntimeHealthController } from './runtime-health.controller';
import type { RuntimeReadinessService } from './runtime-readiness.service';

describe('RuntimeHealthController', () => {
  const response = () =>
    ({
      status: jest.fn().mockReturnThis(),
    }) as unknown as Response;

  it('GET /api/v1/live returns process liveness without readiness probes', () => {
    const liveness = jest.fn(() => ({
      status: 'ok' as const,
      timestamp: '2026-09-28T00:00:00.000Z',
    }));
    const readinessProbe = jest.fn();
    const readiness = {
      liveness,
      readiness: readinessProbe,
    } as unknown as RuntimeReadinessService;
    const controller = new RuntimeHealthController(readiness);

    expect(controller.live()).toEqual({
      status: 'ok',
      timestamp: '2026-09-28T00:00:00.000Z',
    });
    expect(liveness).toHaveBeenCalledTimes(1);
    expect(readinessProbe).not.toHaveBeenCalled();
  });

  it.each(['ready', 'health'] as const)(
    'GET /api/v1/%s returns 200 for canonical readiness',
    async (method) => {
      const snapshot = {
        status: 'ok' as const,
        timestamp: '2026-09-28T00:00:00.000Z',
        checks: { database: 'ok' as const, uploads: 'ok' as const },
      };
      const readiness = {
        liveness: jest.fn(),
        readiness: jest.fn().mockResolvedValue(snapshot),
      } as unknown as RuntimeReadinessService;
      const controller = new RuntimeHealthController(readiness);
      const res = response();
      const status = jest.spyOn(res, 'status');

      await expect(controller[method](res)).resolves.toEqual(snapshot);
      expect(status).toHaveBeenCalledWith(200);
    },
  );

  it.each(['ready', 'health'] as const)(
    'GET /api/v1/%s returns 503 when a critical local dependency is unavailable',
    async (method) => {
      const snapshot = {
        status: 'not_ready' as const,
        timestamp: '2026-09-28T00:00:00.000Z',
        checks: { database: 'failed' as const, uploads: 'ok' as const },
      };
      const readiness = {
        liveness: jest.fn(),
        readiness: jest.fn().mockResolvedValue(snapshot),
      } as unknown as RuntimeReadinessService;
      const controller = new RuntimeHealthController(readiness);
      const res = response();
      const status = jest.spyOn(res, 'status');

      await expect(controller[method](res)).resolves.toEqual(snapshot);
      expect(status).toHaveBeenCalledWith(503);
    },
  );
});
