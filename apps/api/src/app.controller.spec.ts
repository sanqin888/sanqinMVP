// apps/api/src/app.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController (unit)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            // 给被注入的 Service 打桩，避免 DI 报错
            root: () => ({ ok: true }),
            health: () => ({ status: 'ok' }),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should return root ok', () => {
    expect(controller.root()).toEqual({ ok: true });
  });

  it('should return health ok', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});