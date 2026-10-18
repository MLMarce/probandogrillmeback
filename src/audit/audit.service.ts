import { Injectable } from '@nestjs/common';
import { Auditoria, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EventoAuditoria = 'login' | 'create' | 'update' | 'baja' | 'importacion';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    evento: EventoAuditoria,
    autor: string | null,
    entidad: string | null,
    detalle: Prisma.InputJsonValue | undefined = undefined,
  ): Prisma.PrismaPromise<Auditoria> {
    return this.prisma.auditoria.create({
      data: { evento, autor, entidad, detalle },
    });
  }
}
