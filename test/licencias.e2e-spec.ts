import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildApp, empleadoRow, makePrismaMock } from './helpers';

function licenciaRow(overrides: Record<string, unknown> = {}) {
  const ahora = Date.now();
  return {
    id: 'l1',
    empleadoId: 'e1',
    desde: new Date(ahora - 24 * 60 * 60 * 1000),
    hasta: new Date(ahora + 24 * 60 * 60 * 1000),
    motivo: 'Enfermedad',
    ...overrides,
  };
}

function iso(offsetDias: number): string {
  return new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000).toISOString();
}

describe('Licencias (e2e)', () => {
  let app: INestApplication;
  const prisma = makePrismaMock();

  beforeAll(async () => {
    app = await buildApp(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.empleado.findUnique.mockResolvedValue(null);
    prisma.empleado.findFirst.mockResolvedValue(null);
    prisma.empleado.update.mockResolvedValue({});
    prisma.licencia.findFirst.mockResolvedValue(null);
    prisma.licencia.findMany.mockResolvedValue([]);
    prisma.licencia.create.mockResolvedValue({});
    prisma.auditoria.create.mockResolvedValue({});
  });

  it('crea una licencia vigente y sincroniza el Estado a licencia', async () => {
    const row = licenciaRow();
    prisma.empleado.findUnique
      .mockResolvedValueOnce(empleadoRow())
      .mockResolvedValueOnce(empleadoRow());
    prisma.licencia.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row);
    prisma.licencia.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'e1', desde: iso(-1), hasta: iso(1), motivo: 'Enfermedad' })
      .expect(201);

    expect(res.body).toEqual({
      id: 'l1',
      empleadoId: 'e1',
      desde: row.desde.toISOString(),
      hasta: row.hasta.toISOString(),
      motivo: 'Enfermedad',
      vigente: true,
    });
    expect(prisma.empleado.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { estado: 'licencia' },
    });
  });

  it('rechaza fechas desde > hasta con 422 sin abrir transacción', async () => {
    await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'e1', desde: iso(5), hasta: iso(1) })
      .expect(422);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza solape con licencia existente con 409', async () => {
    prisma.empleado.findUnique.mockResolvedValueOnce(empleadoRow());
    prisma.licencia.findFirst.mockResolvedValueOnce(licenciaRow());

    await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'e1', desde: iso(0), hasta: iso(3) })
      .expect(409);
    expect(prisma.licencia.create).not.toHaveBeenCalled();
    expect(prisma.empleado.update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el Empleado no existe', async () => {
    await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'nope', desde: iso(-1), hasta: iso(1) })
      .expect(404);
    expect(prisma.licencia.create).not.toHaveBeenCalled();
  });

  it('aplica la regla inversa: sin licencia vigente vuelve a activo', async () => {
    const row = licenciaRow({
      desde: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      hasta: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const licenciaState = empleadoRow({ estado: 'licencia' });
    prisma.empleado.findUnique
      .mockResolvedValueOnce(licenciaState)
      .mockResolvedValueOnce(licenciaState);
    prisma.licencia.create.mockResolvedValue(row);

    const res = await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'e1', desde: iso(-10), hasta: iso(-5) })
      .expect(201);

    expect(res.body.vigente).toBe(false);
    expect(prisma.empleado.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { estado: 'activo' },
    });
  });

  it('lista el histórico más reciente primero con el flag vigente', async () => {
    const row = licenciaRow();
    const pasada = licenciaRow({
      id: 'l0',
      desde: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      hasta: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      motivo: null,
    });
    prisma.licencia.findMany.mockResolvedValue([row, pasada]);

    const res = await request(app.getHttpServer())
      .get('/licencias?empleadoId=e1')
      .expect(200);

    expect(prisma.licencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empleadoId: 'e1' },
        orderBy: { desde: 'desc' },
      }),
    );
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'l1', vigente: true });
    expect(res.body[1]).toMatchObject({ id: 'l0', vigente: false, motivo: null });
  });

  it('valida que empleadoId sea obligatorio', async () => {
    await request(app.getHttpServer()).get('/licencias').expect(400);
  });

  it('valida el formato de fechas', async () => {
    await request(app.getHttpServer())
      .post('/licencias')
      .send({ empleadoId: 'e1', desde: 'ayer', hasta: 'mañana' })
      .expect(400);
  });
});

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Licencias persistence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const empleadosCreados: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const { makeApp } = await import('./helpers');
    app = makeApp(moduleRef);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.licencia.deleteMany({
      where: { empleadoId: { in: empleadosCreados } },
    });
    await prisma.empleado.deleteMany({ where: { id: { in: empleadosCreados } } });
    await app.close();
  });

  async function crearEmpleado() {
    const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const empleado = await prisma.empleado.create({
      data: {
        legajo: `L-${sufijo}`,
        nombre: 'Rita',
        apellido: 'Moya',
        dni: sufijo,
        estado: 'activo',
      },
    });
    empleadosCreados.push(empleado.id);
    return empleado;
  }

  it('crea licencias, sincroniza Estado y acumula el histórico', async () => {
    const empleado = await crearEmpleado();

    const vigente = await request(app.getHttpServer())
      .post('/licencias')
      .send({
        empleadoId: empleado.id,
        desde: new Date(Date.now() - 60_000).toISOString(),
        hasta: new Date(Date.now() + 60_000).toISOString(),
        motivo: 'Estudio',
      })
      .expect(201);
    expect(vigente.body.vigente).toBe(true);

    const trasCrear = await prisma.empleado.findUnique({ where: { id: empleado.id } });
    expect(trasCrear?.estado).toBe('licencia');

    await request(app.getHttpServer())
      .post('/licencias')
      .send({
        empleadoId: empleado.id,
        desde: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        hasta: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    const solape = await request(app.getHttpServer())
      .post('/licencias')
      .send({
        empleadoId: empleado.id,
        desde: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        hasta: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(409);
    expect(solape.body.message).toContain('solapa');

    const historico = await request(app.getHttpServer())
      .get(`/licencias?empleadoId=${empleado.id}`)
      .expect(200);
    expect(historico.body).toHaveLength(2);
  });

  it('devuelve 422 si desde es posterior a hasta', async () => {
    const empleado = await crearEmpleado();
    await request(app.getHttpServer())
      .post('/licencias')
      .send({
        empleadoId: empleado.id,
        desde: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        hasta: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(422);
  });

  it('reaplica la regla inversa al editar la ficha', async () => {
    const empleado = await crearEmpleado();
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { estado: 'licencia' },
    });

    await request(app.getHttpServer())
      .patch(`/empleados/${empleado.id}`)
      .send({ puesto: 'Otra cosa' })
      .expect(200);

    const trasEditar = await prisma.empleado.findUnique({ where: { id: empleado.id } });
    expect(trasEditar?.estado).toBe('activo');
    expect(trasEditar?.puesto).toBe('Otra cosa');
  });
});
