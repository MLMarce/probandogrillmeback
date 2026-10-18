import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildApp, buildRealApp, makePrismaMock } from './helpers';

const CSV_VALIDO = [
  'legajo,nombre,apellido,dni,email,area',
  'L-9001,Ana,Prueba,90000001,ana@empresa.com,Mantenimiento',
].join('\n');

describe('Importación CSV (e2e)', () => {
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
    prisma.empleado.findMany.mockResolvedValue([]);
    prisma.empleado.findUnique.mockResolvedValue(null);
    prisma.empleado.findFirst.mockResolvedValue(null);
    prisma.empleado.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `n${Math.random()}`, ...args.data }),
    );
    prisma.empleado.count.mockResolvedValue(0);
    prisma.area.findMany.mockResolvedValue([{ id: 'a1', nombreNorm: 'mantenimiento' }]);
    prisma.area.findUnique.mockResolvedValue({ id: 'a1', nombre: 'Mantenimiento' });
    prisma.licencia.findFirst.mockResolvedValue(null);
    prisma.auditoria.create.mockResolvedValue({});
  });

  it('el preview valida sin escribir nada', async () => {
    const res = await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv: CSV_VALIDO })
      .expect(200);

    expect(res.body.resumen).toEqual({ total: 1, validas: 1, errores: 0, omitidas: 0 });
    expect(res.body.filas[0]).toMatchObject({
      fila: 1,
      estado: 'valida',
      motivo: null,
      legajo: 'L-9001',
      nombre: 'Ana',
      area: 'Mantenimiento',
    });
    expect(prisma.empleado.create).not.toHaveBeenCalled();
    expect(prisma.auditoria.create).not.toHaveBeenCalled();
  });

  it('el preview reporta errores de contenido por fila', async () => {
    const csv = [
      'legajo,nombre,apellido,dni,email,area',
      ',Pedro,Pin,90000002,no-es-email.com,',
      ',Ana,,90000003,ok@empresa.com,',
      ',Luis,Lop,90000004,luis@empresa.com,Inexistente',
    ].join('\n');

    const res = await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv })
      .expect(200);

    expect(res.body.resumen).toEqual({ total: 3, validas: 0, errores: 3, omitidas: 0 });
    expect(res.body.filas[0].motivo).toMatch(/email inválido/i);
    expect(res.body.filas[1].motivo).toMatch(/requeridos/i);
    expect(res.body.filas[2].motivo).toMatch(/no existe/i);
    expect(prisma.empleado.create).not.toHaveBeenCalled();
  });

  it('el preview marca como omitida una fila duplicada en la base', async () => {
    prisma.empleado.findMany.mockResolvedValue([
      { legajo: 'L-EXIST', dni: '30111000' },
    ]);
    const csv = [
      'legajo,nombre,apellido,dni',
      'L-EXIST,Raul,Rey,90000005',
      ',Sofia,Seo,30111000',
    ].join('\n');

    const res = await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv })
      .expect(200);

    expect(res.body.resumen).toEqual({ total: 2, validas: 0, errores: 0, omitidas: 2 });
    expect(res.body.filas[0].motivo).toMatch(/legajo/i);
    expect(res.body.filas[1].motivo).toMatch(/dni/i);
    expect(prisma.empleado.create).not.toHaveBeenCalled();
  });

  it('rechaza un CSV sin las columnas requeridas', async () => {
    await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv: 'nombre,apellido\nAna,Prueba' })
      .expect(422);
  });

  it('rechaza un CSV sin filas de datos', async () => {
    await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv: 'legajo,nombre,apellido,dni' })
      .expect(422);
  });

  it('el confirm inserta solo las válidas, omite duplicados y audita el resumen', async () => {
    prisma.empleado.findMany.mockResolvedValue([
      { legajo: 'L-0001', dni: '30111000' },
    ]);
    let legajoN = 0;
    prisma.empleado.count.mockImplementation(() => Promise.resolve(legajoN++));
    const csv = [
      'legajo,nombre,apellido,dni,email,area',
      ',Lucia,Ley,90000001,lucia@empresa.com,Mantenimiento',
      ',Mario,Mia,90000002,mario@empresa.com,',
      ',Dupa,Dni,30111000,ok@empresa.com,',
      ',Mala,Mail,90000003,malo-email,',
    ].join('\n');

    const res = await request(app.getHttpServer())
      .post('/importaciones/confirm')
      .send({ csv })
      .expect(200);

    expect(res.body).toMatchObject({ creados: 2, omitidos: 1, errores: 1, totalFilas: 4 });
    expect(res.body.detalle).toEqual([
      expect.objectContaining({ fila: 1, estado: 'creada', legajo: 'L-0001' }),
      expect.objectContaining({ fila: 2, estado: 'creada', legajo: 'L-0002' }),
      expect.objectContaining({ fila: 3, estado: 'omitida', motivo: expect.stringMatching(/dni/i) }),
      expect.objectContaining({ fila: 4, estado: 'error', motivo: expect.stringMatching(/email/i) }),
    ]);
    expect(prisma.empleado.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evento: 'importacion',
          autor: null,
          detalle: { totalFilas: 4, creados: 2, omitidos: 1, errores: 1 },
        }),
      }),
    );
  });

  it('continúa ante un error de creación y lo reporta como error de fila', async () => {
    prisma.area.findMany.mockResolvedValue([{ id: 'a1', nombreNorm: 'mantenimiento' }]);
    prisma.area.findUnique.mockResolvedValue(null);
    const csv = [
      'legajo,nombre,apellido,dni,area',
      ',Sin,Area,90000101,Mantenimiento',
    ].join('\n');

    const res = await request(app.getHttpServer())
      .post('/importaciones/confirm')
      .send({ csv })
      .expect(200);

    expect(res.body).toMatchObject({ creados: 0, omitidos: 0, errores: 1 });
    expect(res.body.detalle[0]).toMatchObject({
      estado: 'error',
      motivo: 'El Área indicada no existe',
    });
    expect(prisma.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evento: 'importacion' }),
      }),
    );
  });
});

const describeIfDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('Importación CSV persistence (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const creados: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = await buildRealApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.empleado.deleteMany({ where: { id: { in: creados } } });
    await app.close();
  });

  it('preview no escribe; confirm inserta válidas y persiste la auditoría', async () => {
    const sufijo = Date.now().toString(36);
    const area = await prisma.area.create({
      data: { nombre: `Import ${sufijo}`, nombreNorm: `import ${sufijo}` },
    });
    const existente = await prisma.empleado.create({
      data: {
        legajo: `L-IMP-${sufijo}`,
        nombre: 'Ya',
        apellido: 'Existe',
        dni: `${Date.now()}9`,
        areaId: area.id,
      },
    });
    creados.push(existente.id);

    const csv = [
      'legajo,nombre,apellido,dni,email,area',
      `,Nuevo,Alta,${Date.now()}1,nuevo@empresa.com,Import ${sufijo}`,
      `,Dni,Repetido,${existente.dni},dup@empresa.com,`,
      `,Mala,Mail,${Date.now()}2,no-es-email,`,
    ].join('\n');

    const antes = await prisma.empleado.count();
    const preview = await request(app.getHttpServer())
      .post('/importaciones/preview')
      .send({ csv })
      .expect(200);
    expect(preview.body.resumen).toEqual({ total: 3, validas: 1, errores: 1, omitidas: 1 });
    expect(await prisma.empleado.count()).toBe(antes);

    const confirm = await request(app.getHttpServer())
      .post('/importaciones/confirm')
      .send({ csv })
      .expect(200);
    expect(confirm.body).toMatchObject({ creados: 1, omitidos: 1, errores: 1 });
    const legajoCreado = confirm.body.detalle.find((d: { estado: string }) => d.estado === 'creada')
      .legajo as string;

    const creado = await prisma.empleado.findUnique({ where: { legajo: legajoCreado } });
    expect(creado).not.toBeNull();
    creados.push(creado!.id);

    const importaciones = await prisma.auditoria.findMany({
      where: { evento: 'importacion' },
    });
    expect(importaciones.length).toBeGreaterThan(0);
    expect(importaciones[0].detalle).toMatchObject({ creados: 1, omitidos: 1, errores: 1 });
  });
});
