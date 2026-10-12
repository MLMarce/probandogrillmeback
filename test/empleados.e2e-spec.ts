import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function makePrismaMock() {
  return {
    empleado: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

function makeApp(moduleRef: { createNestApplication: () => INestApplication }): INestApplication {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

function empleadoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    legajo: 'L-0001',
    nombre: 'Lucas',
    apellido: 'Gómez',
    puesto: 'Mantenimiento de electricidad',
    estado: 'activo',
    area: { id: 'a1', nombre: 'Mantenimiento' },
    ...overrides,
  };
}

describe('Empleados listado (e2e)', () => {
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
    prisma.empleado.findMany.mockResolvedValue([]);
    prisma.empleado.count.mockResolvedValue(0);
  });

  it('devuelve un listado paginado vacío por defecto', async () => {
    const res = await request(app.getHttpServer()).get('/empleados').expect(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it('calcula el offset de la página pedida', async () => {
    await request(app.getHttpServer()).get('/empleados?page=3&pageSize=5').expect(200);
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it('busca por nombre, apellido o legajo sin distinguir mayúsculas', async () => {
    await request(app.getHttpServer()).get('/empleados?search=lucas').expect(200);
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { nombre: { contains: 'lucas', mode: 'insensitive' } },
            { apellido: { contains: 'lucas', mode: 'insensitive' } },
            { legajo: { contains: 'lucas', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('combina filtros de área y estado', async () => {
    await request(app.getHttpServer())
      .get('/empleados?areaId=a1&estado=activo&search=gomez')
      .expect(200);
    expect(prisma.empleado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          areaId: 'a1',
          estado: 'activo',
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('mapea el área del empleado a areaId/areaNombre', async () => {
    prisma.empleado.findMany.mockResolvedValue([empleadoRow()]);
    prisma.empleado.count.mockResolvedValue(1);

    const res = await request(app.getHttpServer()).get('/empleados').expect(200);
    expect(res.body.items[0]).toEqual({
      id: 'e1',
      legajo: 'L-0001',
      nombre: 'Lucas',
      apellido: 'Gómez',
      puesto: 'Mantenimiento de electricidad',
      estado: 'activo',
      areaId: 'a1',
      areaNombre: 'Mantenimiento',
    });
    expect(res.body.total).toBe(1);
  });

  it('rechaza parámetros de paginación inválidos', async () => {
    await request(app.getHttpServer()).get('/empleados?page=0').expect(400);
    await request(app.getHttpServer()).get('/empleados?pageSize=1000').expect(400);
  });
});

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Empleados listado persistence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const creados: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = makeApp(moduleRef);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.licencia.deleteMany({});
    await prisma.empleado.deleteMany({ where: { id: { in: creados } } });
    await app.close();
  });

  it('filtra y pagina sobre datos reales', async () => {
    const sufijo = Date.now().toString(36);
    const a = await prisma.empleado.create({
      data: { legajo: `L-${sufijo}-1`, nombre: 'Lucas', apellido: 'Gómez', dni: `${Date.now()}1` },
    });
    const b = await prisma.empleado.create({
      data: {
        legajo: `L-${sufijo}-2`,
        nombre: 'Laura',
        apellido: 'Gómez',
        dni: `${Date.now()}2`,
        estado: 'inactivo',
      },
    });
    creados.push(a.id, b.id);

    const res = await request(app.getHttpServer())
      .get(`/empleados?search=gomez&estado=activo`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].nombre).toBe('Lucas');

    const paginado = await request(app.getHttpServer())
      .get(`/empleados?search=${sufijo}&pageSize=1&page=2`)
      .expect(200);
    expect(paginado.body.total).toBe(2);
    expect(paginado.body.items).toHaveLength(1);
  });

  it('el listado vacío responde items []', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empleados?search=${randomUUID()}`)
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});
