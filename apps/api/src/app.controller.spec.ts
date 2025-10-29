// apps/api/src/app.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getApiPrefix } from './app.bootstrap';

describe('AppController (unit)', () => {
  let controller: AppController; // 显式类型，避免 any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          // 提供一个最小桩对象，避免依赖解析失败
          provide: AppService,
          useValue: {
            root: () => ({ service: 'sanqin-api', version: getApiPrefix() }),
            health: () => ({
              status: 'ok',
              timestamp: '2024-01-01T00:00:00.000Z',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

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
