import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { PrismaService } from '../src/prisma/prisma.service';

function makeSupabaseMock() {
  return {
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    signOut: jest.fn(),
    requestRecovery: jest.fn(),
  };
}

function makeApp(moduleRef: { createNestApplication: () => INestApplication }): INestApplication {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const supabaseMock = makeSupabaseMock();
  const auditoriaCreate = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(supabaseMock)
      .overrideProvider(PrismaService)
      .useValue({ auditoria: { create: auditoriaCreate } })
      .compile();
    app = makeApp(moduleRef);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auditoriaCreate.mockResolvedValue({});
  });

  describe('POST /auth/login', () => {
    it('devuelve el access token en un login válido', async () => {
      supabaseMock.signInWithPassword.mockResolvedValue({
        access_token: 'tok-123',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'uuid-1', email: 'rrhh@empresa.com' },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'rrhh@empresa.com', password: 'secreto123' })
        .expect(200);

      expect(res.body.access_token).toBe('tok-123');
      expect(res.body.user.email).toBe('rrhh@empresa.com');
    });

    it('responde 401 con credenciales inválidas', async () => {
      supabaseMock.signInWithPassword.mockRejectedValue(new UnauthorizedException());

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'rrhh@empresa.com', password: 'wrongpass123' })
        .expect(401);
    });

    it('rechaza un payload inválido con 400 (ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'no-es-email', password: 'corto' })
        .expect(400);
    });

    it('registra el evento de auditoría login', async () => {
      supabaseMock.signInWithPassword.mockResolvedValue({
        access_token: 'tok-123',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'uuid-1', email: 'rrhh@empresa.com' },
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'rrhh@empresa.com', password: 'secreto123' })
        .expect(200);

      expect(auditoriaCreate).toHaveBeenCalledWith({
        data: {
          evento: 'login',
          autor: 'rrhh@empresa.com',
          entidad: 'auth',
          detalle: { user_id: 'uuid-1' },
        },
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('cierra la sesión con el token Bearer', async () => {
      supabaseMock.signOut.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', 'Bearer tok-123')
        .expect(200);

      expect(supabaseMock.signOut).toHaveBeenCalledWith('tok-123');
    });
  });

  describe('GET /auth/session', () => {
    it('devuelve el usuario de la sesión válida', async () => {
      supabaseMock.getUser.mockResolvedValue({ id: 'uuid-1', email: 'rrhh@empresa.com' });

      const res = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', 'Bearer tok-123')
        .expect(200);

      expect(res.body).toEqual({ id: 'uuid-1', email: 'rrhh@empresa.com' });
    });

    it('responde 401 sin token', async () => {
      await request(app.getHttpServer()).get('/auth/session').expect(401);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('acepta el email y responde 202 aunque la cuenta no exista', async () => {
      supabaseMock.requestRecovery.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email: 'rrhh@empresa.com' })
        .expect(202);

      expect(supabaseMock.requestRecovery).toHaveBeenCalledWith('rrhh@empresa.com');
    });
  });
});

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Auth login audit persistence (e2e)', () => {
  let app: INestApplication;
  const supabaseMock = makeSupabaseMock();

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue(supabaseMock)
      .compile();
    app = makeApp(moduleRef);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('persiste el evento login en la tabla auditoria', async () => {
    const email = `audit-${randomUUID()}@empresa.com`;
    supabaseMock.signInWithPassword.mockResolvedValue({
      access_token: 'tok-123',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: randomUUID(), email },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'secreto123' })
      .expect(200);

    const prisma = app.get(PrismaService);
    const row = await prisma.auditoria.findFirst({
      where: { evento: 'login', autor: email },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row?.entidad).toBe('auth');
  });
});
