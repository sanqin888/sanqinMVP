import request, { SuperTest, Test } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let http: SuperTest<Test>;

  beforeAll(async () => {
    const prismaServiceStub = {
      onModuleInit: async (): Promise<void> => {
        /* no-op: skip real DB connection in e2e */
      },
      onModuleDestroy: async (): Promise<void> => {
        /* no-op */
      },
      enableShutdownHooks: (): void => {
        /* no-op */
      },
    } satisfies Partial<PrismaService>;

    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceStub)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', async () => {
    await http.get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /api', async () => {
    await http.get('/api').expect(200).expect({ ok: true });
  });
});
