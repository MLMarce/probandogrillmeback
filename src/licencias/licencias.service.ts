import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Licencia } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { resolveActor } from '../common/resolve-actor';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLicenciaDto, LicenciaResponse, ListLicenciasQueryDto } from './licencia.dto';
import { esVigente, normalizarPeriodo } from './periodo';
import { syncEstadoPorLicencia } from './sync-estado';

@Injectable()
export class LicenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
  ) {}

  async create(dto: CreateLicenciaDto, authorization?: string): Promise<LicenciaResponse> {
    const { desde, hasta } = normalizarPeriodo(dto.desde, dto.hasta);
    if (desde > hasta) {
      throw new UnprocessableEntityException(
        'La fecha desde debe ser anterior o igual a la fecha hasta',
      );
    }
    const autor = await resolveActor(this.supabase, authorization);

    return this.prisma.$transaction(async (tx) => {
      const empleado = await tx.empleado.findUnique({ where: { id: dto.empleadoId } });
      if (!empleado) {
        throw new NotFoundException('Empleado no encontrado');
      }
      const vigente = esVigente(desde, hasta);
      if (vigente && empleado.estado === 'inactivo') {
        throw new ConflictException(
          'El Empleado está inactivo: no se puede registrar una licencia vigente',
        );
      }
      const solape = await tx.licencia.findFirst({
        where: {
          empleadoId: dto.empleadoId,
          desde: { lte: hasta },
          hasta: { gte: desde },
        },
      });
      if (solape) {
        throw new ConflictException(
          'El Empleado ya tiene una licencia que se solapa con ese período',
        );
      }
      const licencia = await tx.licencia.create({
        data: {
          empleadoId: dto.empleadoId,
          desde,
          hasta,
          motivo: dto.motivo?.trim() || null,
        },
      });
      const cambio = await syncEstadoPorLicencia(tx, dto.empleadoId);
      await this.audit.record(
        'create',
        autor,
        'licencia',
        {
          id: licencia.id,
          empleadoId: licencia.empleadoId,
          desde: licencia.desde.toISOString(),
          hasta: licencia.hasta.toISOString(),
          motivo: licencia.motivo,
          vigente,
        },
        tx,
      );
      if (cambio) {
        await this.audit.record(
          'update',
          autor,
          'empleado',
          {
            id: dto.empleadoId,
            legajo: empleado.legajo,
            cambios: [{ campo: 'estado', antes: cambio.antes, despues: cambio.despues }],
          },
          tx,
        );
      }
      return this.toResponse(licencia);
    });
  }

  async findAll(query: ListLicenciasQueryDto): Promise<LicenciaResponse[]> {
    const licencias = await this.prisma.licencia.findMany({
      where: { empleadoId: query.empleadoId },
      orderBy: { desde: 'desc' },
    });
    return licencias.map((l) => this.toResponse(l));
  }

  private toResponse(l: Licencia): LicenciaResponse {
    return {
      id: l.id,
      empleadoId: l.empleadoId,
      desde: l.desde.toISOString(),
      hasta: l.hasta.toISOString(),
      motivo: l.motivo,
      vigente: esVigente(l.desde, l.hasta),
    };
  }
}
