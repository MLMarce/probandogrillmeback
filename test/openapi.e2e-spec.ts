import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureSwagger } from '../src/main';

describe('OpenAPI contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sirve el spec OpenAPI 3 en /api/docs-json', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
  });

  it('el spec incluye el endpoint de health', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.paths).toHaveProperty('/health');
  });
});
