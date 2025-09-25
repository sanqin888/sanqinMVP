// apps/api/src/app.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
            root: () => ({ ok: true }),
            health: () => ({ status: 'ok' }),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('GET /api -> { ok: true }', () => {
    expect(controller.root()).toEqual({ ok: true });
  });

  it('GET /api/health -> { status: "ok" }', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
