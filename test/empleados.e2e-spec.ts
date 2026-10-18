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
      update: jest.fn(),
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

  function detalleRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'e1',
      legajo: 'L-0001',
      nombre: 'Lucas',
      apellido: 'Gómez',
      dni: '30111222',
      fechaNacimiento: null,
      email: null,
      telefono: null,
      direccion: null,
      puesto: 'Electricista',
      fechaIngreso: null,
      estado: 'activo',
      areaId: 'a1',
      area: { id: 'a1', nombre: 'Mantenimiento' },
      supervisorId: null,
      supervisor: null,
      ...overrides,
    };
  }

  it('devuelve la ficha completa por id', async () => {
    prisma.empleado.findFirst.mockResolvedValue(
      detalleRow({
        supervisorId: 'e9',
        supervisor: { nombre: 'Ana', apellido: 'Suárez' },
      }),
    );

    const res = await request(app.getHttpServer()).get('/empleados/e1').expect(200);
    expect(res.body).toMatchObject({
      id: 'e1',
      legajo: 'L-0001',
      dni: '30111222',
      puesto: 'Electricista',
      estado: 'activo',
      areaNombre: 'Mantenimiento',
      supervisorNombre: 'Ana Suárez',
    });
    expect(prisma.empleado.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ id: 'e1' }, { legajo: 'e1' }] },
      }),
    );
  });

  it('acepta legajo como identificador de la ficha', async () => {
    prisma.empleado.findFirst.mockResolvedValue(detalleRow());

    const res = await request(app.getHttpServer()).get('/empleados/L-0001').expect(200);
    expect(res.body.id).toBe('e1');
  });

  it('devuelve 404 si el Empleado no existe', async () => {
    prisma.empleado.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/empleados/no-existe').expect(404);
  });

  it('edita campos y registra los cambios en auditoría', async () => {
    prisma.empleado.findFirst
      .mockResolvedValueOnce(detalleRow())
      .mockResolvedValueOnce(detalleRow({ puesto: 'Supervisor electricidad' }));
    prisma.empleado.update.mockResolvedValue({});
    supabase.getUser.mockResolvedValue({ email: 'admin@empresa.com' });

    const res = await request(app.getHttpServer())
      .patch('/empleados/e1')
      .set('Authorization', 'Bearer token-valido')
      .send({ puesto: 'Supervisor electricidad' })
      .expect(200);
    expect(res.body.puesto).toBe('Supervisor electricidad');

    expect(prisma.empleado.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { puesto: 'Supervisor electricidad' },
    });
    expect(prisma.auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evento: 'update',
        autor: 'admin@empresa.com',
        entidad: 'empleado',
        detalle: expect.objectContaining({
          id: 'e1',
          cambios: [
            { campo: 'puesto', antes: 'Electricista', despues: 'Supervisor electricidad' },
          ],
        }),
      }),
    });
  });

  it('no persiste ni audita cuando no hay cambios', async () => {
    prisma.empleado.findFirst.mockResolvedValue(detalleRow());

    const res = await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ puesto: 'Electricista' })
      .expect(200);
    expect(res.body.puesto).toBe('Electricista');
    expect(prisma.empleado.update).not.toHaveBeenCalled();
    expect(prisma.auditoria.create).not.toHaveBeenCalled();
  });

  it('rechaza un supervisor que no está activo', async () => {
    prisma.empleado.findFirst
      .mockResolvedValueOnce(detalleRow())
      .mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ supervisorId: 'e-inactivo' })
      .expect(422);
    expect(prisma.empleado.update).not.toHaveBeenCalled();
  });

  it('rechaza que un Empleado sea su propio supervisor', async () => {
    prisma.empleado.findFirst.mockResolvedValue(detalleRow());

    await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ supervisorId: 'e1' })
      .expect(422);
  });

  it('rechaza un legajo duplicado al editar con 409', async () => {
    prisma.empleado.findFirst.mockResolvedValue(detalleRow());
    prisma.empleado.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.16.2',
        meta: { target: ['legajo'] },
      }),
    );

    await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ legajo: 'L-0002' })
      .expect(409);
  });

  it('limpia una fecha con string vacío sin rechazar con 400', async () => {
    const conFecha = new Date('1990-05-01T00:00:00.000Z');
    prisma.empleado.findFirst
      .mockResolvedValueOnce(detalleRow({ fechaNacimiento: conFecha }))
      .mockResolvedValueOnce(detalleRow({ fechaNacimiento: null }));
    prisma.empleado.update.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ fechaNacimiento: '' })
      .expect(200);
    expect(res.body.fechaNacimiento).toBeNull();
    expect(prisma.empleado.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { fechaNacimiento: null },
    });
    expect(prisma.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detalle: expect.objectContaining({
            cambios: [
              { campo: 'fechaNacimiento', antes: conFecha.toISOString(), despues: null },
            ],
          }),
        }),
      }),
    );
  });

  it('permite editar otros campos cuando el supervisor actual está inactivo', async () => {
    prisma.empleado.findFirst
      .mockResolvedValueOnce(
        detalleRow({
          supervisorId: 'e9',
          supervisor: { nombre: 'Ana', apellido: 'Inactiva' },
        }),
      )
      .mockResolvedValueOnce(
        detalleRow({
          supervisorId: 'e9',
          supervisor: { nombre: 'Ana', apellido: 'Inactiva' },
          puesto: 'Nuevo puesto',
        }),
      );
    prisma.empleado.update.mockResolvedValue({});

    const res = await request(app.getHttpServer())
      .patch('/empleados/e1')
      .send({ supervisorId: 'e9', puesto: 'Nuevo puesto' })
      .expect(200);
    expect(res.body.supervisorNombre).toBe('Ana Inactiva');
    expect(res.body.puesto).toBe('Nuevo puesto');
    expect(prisma.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detalle: expect.objectContaining({
            cambios: [{ campo: 'puesto', antes: 'Electricista', despues: 'Nuevo puesto' }],
          }),
        }),
      }),
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

  it('edita un Empleado real y audita el cambio', async () => {
    const sufijo = Date.now().toString(36);
    const creado = await request(app.getHttpServer())
      .post('/empleados')
      .send({ nombre: 'Edicion', apellido: `Real ${sufijo}`, dni: `${Date.now()}` })
      .expect(201);
    creados.push(creado.body.id);

    const ficha = await request(app.getHttpServer())
      .get(`/empleados/${creado.body.legajo}`)
      .expect(200);
    expect(ficha.body.nombre).toBe('Edicion');

    const editado = await request(app.getHttpServer())
      .patch(`/empleados/${creado.body.id}`)
      .send({ puesto: 'Operador', email: `editado.${sufijo}@empresa.com` })
      .expect(200);
    expect(editado.body.puesto).toBe('Operador');
    expect(editado.body.email).toBe(`editado.${sufijo}@empresa.com`);

    const auditorias = await prisma.auditoria.findMany({
      where: { evento: 'update', entidad: 'empleado' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(auditorias[0].detalle).toMatchObject({
      id: creado.body.id,
      cambios: expect.arrayContaining([
        expect.objectContaining({ campo: 'puesto', despues: 'Operador' }),
        expect.objectContaining({ campo: 'email' }),
      ]),
    });
  });
});
