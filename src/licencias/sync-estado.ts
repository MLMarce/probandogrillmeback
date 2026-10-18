import { Prisma } from '@prisma/client';

/**
 * Invariante del glosario: "Si existe una Licencia vigente, el Estado debe ser 'licencia'".
 * - vigente + Estado activo → Estado licencia
 * - sin vigente + Estado licencia → Estado activo (regla inversa)
 */
export async function syncEstadoPorLicencia(
  db: Prisma.TransactionClient,
  empleadoId: string,
): Promise<void> {
  const ahora = new Date();
  const [vigente, empleado] = await Promise.all([
    db.licencia.findFirst({
      where: { empleadoId, desde: { lte: ahora }, hasta: { gte: ahora } },
    }),
    db.empleado.findUnique({ where: { id: empleadoId } }),
  ]);
  if (!empleado) return;
  if (vigente && empleado.estado === 'activo') {
    await db.empleado.update({ where: { id: empleadoId }, data: { estado: 'licencia' } });
  } else if (!vigente && empleado.estado === 'licencia') {
    await db.empleado.update({ where: { id: empleadoId }, data: { estado: 'activo' } });
  }
}
