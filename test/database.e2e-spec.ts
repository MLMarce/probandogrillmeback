import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Database connectivity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde SELECT 1 contra Postgres', async () => {
    const rows = await prisma.$queryRaw<[{ one: number }]>`SELECT 1 as one`;
    expect(rows[0].one).toBe(1);
  });
});
