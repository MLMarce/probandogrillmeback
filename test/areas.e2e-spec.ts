import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function makePrismaMock() {
  return {
    area: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    empleado: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

function makeApp(moduleRef: { createNestApplication: () => INestApplication }): INestApplication {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

describe('Areas (e2e)', () => {
  let app: INestApplication;
  const prisma = makePrismaMock();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = makeApp(moduleRef);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /areas lista las áreas', async () => {
    prisma.area.findMany.mockResolvedValue([
      { id: 'a1', nombre: 'Administración', nombreNorm: 'administracion', supervisorId: null },
    ]);

    const res = await request(app.getHttpServer()).get('/areas').expect(200);
    expect(res.body).toEqual([{ id: 'a1', nombre: 'Administración', supervisorId: null }]);
  });

  it('POST /areas crea con nombre normalizado', async () => {
    prisma.area.create.mockImplementation(({ data }: { data: { nombre: string } }) =>
      Promise.resolve({ id: 'a1', nombre: data.nombre, supervisorId: null }),
    );

    const res = await request(app.getHttpServer())
      .post('/areas')
      .send({ nombre: '  Mantenimiento ' })
      .expect(201);

    expect(res.body.nombre).toBe('Mantenimiento');
    expect(prisma.area.create).toHaveBeenCalledWith({
      data: { nombre: 'Mantenimiento', nombreNorm: 'mantenimiento' },
    });
  });

  it('POST /areas responde 409 si el nombre ya existe (case-insensitive)', async () => {
    const { Prisma } = await import('@prisma/client');
    prisma.area.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await request(app.getHttpServer())
      .post('/areas')
      .send({ nombre: 'mantenimiento' })
      .expect(409);
  });

  it('POST /areas responde 422 si el supervisor no está activo', async () => {
    prisma.empleado.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/areas')
      .send({ nombre: 'Mantenimiento', supervisorId: 'emp-1' })
      .expect(422);
  });

  it('PATCH /areas/:id renombra un área', async () => {
    prisma.area.findUnique.mockResolvedValue({
      id: 'a1',
      nombre: 'Mantenimiento',
      nombreNorm: 'mantenimiento',
      supervisorId: null,
    });
    prisma.area.update.mockImplementation(({ data }: { data: { nombre: string } }) =>
      Promise.resolve({ id: 'a1', nombre: data.nombre, supervisorId: null }),
    );

    const res = await request(app.getHttpServer())
      .patch('/areas/a1')
      .send({ nombre: 'Mantenimiento eléctrico' })
      .expect(200);

    expect(res.body.nombre).toBe('Mantenimiento eléctrico');
  });

  it('DELETE /areas/:id responde 409 cuando tiene Empleados', async () => {
    prisma.area.findUnique.mockResolvedValue({
      id: 'a1',
      nombre: 'Mantenimiento',
      nombreNorm: 'mantenimiento',
      supervisorId: null,
    });
    prisma.empleado.count.mockResolvedValue(3);

    const res = await request(app.getHttpServer()).delete('/areas/a1').expect(409);
    expect(res.body.message).toMatch(/Empleados asignados/);
    expect(prisma.area.delete).not.toHaveBeenCalled();
  });

  it('DELETE /areas/:id borra un área vacía', async () => {
    prisma.area.findUnique.mockResolvedValue({
      id: 'a1',
      nombre: 'Mantenimiento',
      nombreNorm: 'mantenimiento',
      supervisorId: null,
    });
    prisma.empleado.count.mockResolvedValue(0);
    prisma.area.delete.mockResolvedValue({});

    await request(app.getHttpServer()).delete('/areas/a1').expect(204);
    expect(prisma.area.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('DELETE /areas/:id responde 404 si no existe', async () => {
    prisma.area.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer()).delete('/areas/nope').expect(404);
  });
});

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Areas persistence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = makeApp(moduleRef);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el nombre es único ignorando mayúsculas y la FK de supervisor apunta a un Empleado', async () => {
    const sufijo = Date.now().toString(36);
    const nombre = `Mixta ${sufijo}`;
    const creado = await request(app.getHttpServer())
      .post('/areas')
      .send({ nombre })
      .expect(201);

    await request(app.getHttpServer())
      .post('/areas')
      .send({ nombre: nombre.toUpperCase() })
      .expect(409);

    const emp = await prisma.empleado.create({
      data: { legajo: `L-${sufijo}`, nombre: 'Lucas', apellido: 'Pérez', dni: `${Date.now()}` },
    });
    const conSup = await request(app.getHttpServer())
      .patch(`/areas/${creado.body.id}`)
      .send({ supervisorId: emp.id })
      .expect(200);
    expect(conSup.body.supervisorId).toBe(emp.id);

    await request(app.getHttpServer()).delete(`/areas/${creado.body.id}`).expect(409);

    await prisma.area.delete({ where: { id: creado.body.id } });
    await prisma.empleado.delete({ where: { id: emp.id } });
  });
});
