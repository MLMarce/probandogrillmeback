import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseService } from '../src/supabase/supabase.service';

export function makePrismaMock() {
  const prisma = {
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
    licencia: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    auditoria: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

export function makeApp(
  moduleRef: { createNestApplication: () => INestApplication },
): INestApplication {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}

export async function buildApp(prisma: ReturnType<typeof makePrismaMock>): Promise<INestApplication> {
  const supabase = { getUser: jest.fn() };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(SupabaseService)
    .useValue(supabase)
    .compile();
  const app = makeApp(moduleRef);
  await app.init();
  return app;
}

export function empleadoRow(overrides: Record<string, unknown> = {}) {
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
