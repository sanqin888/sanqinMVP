import request, { SuperTest, Test } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let http: SuperTest<Test>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /', async () => {
    await http.get('/').expect(200).expect('Hello World!');
  });
});
