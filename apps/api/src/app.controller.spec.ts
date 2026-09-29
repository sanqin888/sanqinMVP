import { AppController } from './app.controller';
import type { AppService } from './app.service';
import { getApiPrefix } from './app.bootstrap';

describe('AppController (unit)', () => {
  const appService: AppService = {
    root: () => ({ service: 'sanqin-api', version: getApiPrefix() }),
  };
  const controller = new AppController(appService);

  it('GET /api/v1 -> service metadata', () => {
    expect(controller.root()).toEqual({
      service: 'sanqin-api',
      version: getApiPrefix(),
    });
  });
});
