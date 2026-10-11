import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EventoAuditoria = 'login' | 'create' | 'update' | 'baja' | 'importacion';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    evento: EventoAuditoria,
    autor: string | null,
    entidad: string | null,
    detalle: Prisma.InputJsonValue | undefined = undefined,
  ) {
    return this.prisma.auditoria.create({
      data: { evento, autor, entidad, detalle },
    });
  }
}
