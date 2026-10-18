import { Prisma } from '@prisma/client';

export interface CambioEstado {
  antes: string;
  despues: string;
}

/**
 * Invariante del glosario: "Si existe una Licencia vigente, el Estado debe ser 'licencia'".
 * - vigente + Estado activo → Estado licencia
 * - sin vigente + Estado licencia → Estado activo (regla inversa)
 *
 * Devuelve el cambio aplicado, o null si el Estado no se tocó.
 */
export async function syncEstadoPorLicencia(
  db: Prisma.TransactionClient,
  empleadoId: string,
): Promise<CambioEstado | null> {
  const ahora = new Date();
  const [vigente, empleado] = await Promise.all([
    db.licencia.findFirst({
      where: { empleadoId, desde: { lte: ahora }, hasta: { gte: ahora } },
    }),
    db.empleado.findUnique({ where: { id: empleadoId } }),
  ]);
  if (!empleado) return null;
  if (vigente && empleado.estado === 'activo') {
    await db.empleado.update({ where: { id: empleadoId }, data: { estado: 'licencia' } });
    return { antes: empleado.estado, despues: 'licencia' };
  }
  if (!vigente && empleado.estado === 'licencia') {
    await db.empleado.update({ where: { id: empleadoId }, data: { estado: 'activo' } });
    return { antes: empleado.estado, despues: 'activo' };
  }
  return null;
}
