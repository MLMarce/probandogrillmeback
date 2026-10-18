const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esVigente(desde: Date, hasta: Date, ahora = new Date()): boolean {
  return desde.getTime() <= ahora.getTime() && hasta.getTime() >= ahora.getTime();
}

/**
 * Un `hasta` date-only (viene de un input type="date") se normaliza al final
 * del día en UTC, para que la licencia esté vigente durante todo el día mostrado.
 */
export function normalizarPeriodo(desdeIso: string, hastaIso: string): { desde: Date; hasta: Date } {
  const desde = new Date(desdeIso);
  const hasta = SOLO_FECHA.test(hastaIso)
    ? new Date(`${hastaIso}T23:59:59.999Z`)
    : new Date(hastaIso);
  return { desde, hasta };
}
