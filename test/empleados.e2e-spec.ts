import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseService } from '../src/supabase/supabase.service';

function makePrismaMock() {
  return {
    empleado: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    area: {
      findUnique: jest.fn(),
    },
    auditoria: {
      create: jest.fn(),
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

describe('Empleados listado y alta (e2e)', () => {
  let app: INestApplication;
  const prisma = makePrismaMock();
  const supabase = { getUser: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SupabaseService)
      .useValue(supabase)
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
    prisma.empleado.findUnique.mockResolvedValue(null);
    prisma.empleado.findFirst.mockResolvedValue(null);
    prisma.area.findUnique.mockResolvedValue(null);
    prisma.auditoria.create.mockResolvedValue({});
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

  it('rechaza un estado fuera del vocabulario con 400', async () => {
    await request(app.getHttpServer()).get('/empleados?estado=baja').expect(400);
  });

  const altaBody = { nombre: 'Ana', apellido: 'Suárez', dni: '30111222' };

  function mockCreateOk(overrides: Record<string, unknown> = {}) {
    prisma.empleado.create.mockResolvedValue({
      id: 'e9',
      legajo: 'L-0006',
      nombre: 'Ana',
      apellido: 'Suárez',
      dni: '30111222',
      puesto: null,
      estado: 'activo',
      ...overrides,
    });
  }

  it('crea con legajo autogenerado secuencial cuando no se provee', async () => {
    prisma.empleado.count.mockResolvedValue(5);
    mockCreateOk();

    const res = await request(app.getHttpServer())
      .post('/empleados')
      .send(altaBody)
      .expect(201);

    expect(res.body.legajo).toBe('L-0006');
    expect(prisma.empleado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ legajo: 'L-0006', estado: 'activo' }),
      }),
    );
  });

  it('crea con el legajo provisto', async () => {
    mockCreateOk({ legajo: 'L-777' });

    const res = await request(app.getHttpServer())
      .post('/empleados')
      .send({ ...altaBody, legajo: 'L-777' })
      .expect(201);

    expect(res.body.legajo).toBe('L-777');
  });

  it('rechaza un legajo duplicado con 409', async () => {
    prisma.empleado.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.16.2',
        meta: { target: ['legajo'] },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/empleados')
      .send(altaBody)
      .expect(409);
    expect(res.body.message).toMatch(/legajo/i);
  });

  it('rechaza un DNI duplicado con 409', async () => {
    prisma.empleado.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.16.2',
        meta: { target: ['dni'] },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/empleados')
      .send(altaBody)
      .expect(409);
    expect(res.body.message).toMatch(/dni/i);
  });

  it('rechaza un email inválido con 400', async () => {
    await request(app.getHttpServer())
      .post('/empleados')
      .send({ ...altaBody, email: 'no-es-email' })
      .expect(400);
    expect(prisma.empleado.create).not.toHaveBeenCalled();
  });

  it('valida que el Área indicada exista', async () => {
    await request(app.getHttpServer())
      .post('/empleados')
      .send({ ...altaBody, areaId: 'area-inexistente' })
      .expect(422);
    expect(prisma.empleado.create).not.toHaveBeenCalled();
  });

  it('registra la auditoría de creación con el autor de la sesión', async () => {
    prisma.area.findUnique.mockResolvedValue({ id: 'a1', nombre: 'Mantenimiento' });
    supabase.getUser.mockResolvedValue({ email: 'admin@empresa.com' });
    mockCreateOk({ legajo: 'L-777' });

    await request(app.getHttpServer())
      .post('/empleados')
      .set('Authorization', 'Bearer token-valido')
      .send({ ...altaBody, legajo: 'L-777', areaId: 'a1' })
      .expect(201);

    expect(supabase.getUser).toHaveBeenCalledWith('token-valido');
    expect(prisma.auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evento: 'create',
        autor: 'admin@empresa.com',
        entidad: 'empleado',
        detalle: expect.objectContaining({ legajo: 'L-777', dni: '30111222' }),
      }),
    });
  });

  it('crea sin autor cuando no viene token (delegado al guard global)', async () => {
    mockCreateOk();

    await request(app.getHttpServer())
      .post('/empleados')
      .send(altaBody)
      .expect(201);

    expect(supabase.getUser).not.toHaveBeenCalled();
    expect(prisma.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autor: null }) }),
    );
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
    const area = await prisma.area.create({
      data: { nombre: `Lista ${sufijo}`, nombreNorm: `lista ${sufijo}` },
    });
    const a = await prisma.empleado.create({
      data: {
        legajo: `L-${sufijo}-1`,
        nombre: 'Lucas',
        apellido: 'Gómez',
        dni: `${Date.now()}1`,
        areaId: area.id,
      },
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
    expect(res.body.items[0].areaNombre).toBe(area.nombre);

    const porArea = await request(app.getHttpServer())
      .get(`/empleados?areaId=${area.id}`)
      .expect(200);
    expect(porArea.body.total).toBe(1);
    expect(porArea.body.items[0].legajo).toBe(a.legajo);

    const paginado = await request(app.getHttpServer())
      .get(`/empleados?search=${sufijo}&pageSize=1&page=2`)
      .expect(200);
    expect(paginado.body.total).toBe(2);
    expect(paginado.body.items).toHaveLength(1);

    await prisma.area.delete({ where: { id: area.id } });
  });

  it('el listado vacío responde items []', async () => {
    const res = await request(app.getHttpServer())
      .get(`/empleados?search=${randomUUID()}`)
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('da de alta un Empleado y persiste la auditoría', async () => {
    const sufijo = Date.now().toString(36);
    const res = await request(app.getHttpServer())
      .post('/empleados')
      .send({ nombre: 'Alta', apellido: `Persiste ${sufijo}`, dni: `${Date.now()}` })
      .expect(201);
    creados.push(res.body.id);
    expect(res.body.legajo).toMatch(/^L-\d{4}$/);

    const creado = await prisma.empleado.findUnique({ where: { id: res.body.id } });
    expect(creado?.estado).toBe('activo');

    const auditorias = await prisma.auditoria.findMany({
      where: { evento: 'create', entidad: 'empleado' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(auditorias[0].detalle).toMatchObject({ legajo: res.body.legajo });

    await request(app.getHttpServer())
      .post('/empleados')
      .send({ nombre: 'Otro', apellido: `Persiste ${sufijo}`, dni: creado!.dni })
      .expect(409);
  });
});
