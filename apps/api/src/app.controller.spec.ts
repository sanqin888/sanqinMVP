import { AppController } from './app.controller';
import type { AppService } from './app.service';
import { getApiPrefix } from './app.bootstrap';

describe('AppController (unit)', () => {
  const appService: AppService = {
    root: () => ({ service: 'sanqin-api', version: getApiPrefix() }),
    health: () => ({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00.000Z',
    }),
  };
  const controller = new AppController(appService);

  it('GET /api/v1 -> service metadata', () => {
    expect(controller.root()).toEqual({
      service: 'sanqin-api',
      version: getApiPrefix(),
    });
  });

  it('GET /api/v1/health -> status payload', () => {
    expect(controller.health()).toEqual({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
  });
});
