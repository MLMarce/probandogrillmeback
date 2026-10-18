import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Licencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLicenciaDto, LicenciaResponse, ListLicenciasQueryDto } from './licencia.dto';
import { syncEstadoPorLicencia } from './sync-estado';

@Injectable()
export class LicenciasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLicenciaDto): Promise<LicenciaResponse> {
    const desde = new Date(dto.desde);
    const hasta = new Date(dto.hasta);
    if (desde > hasta) {
      throw new UnprocessableEntityException(
        'La fecha desde debe ser anterior o igual a la fecha hasta',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const empleado = await tx.empleado.findUnique({ where: { id: dto.empleadoId } });
      if (!empleado) {
        throw new NotFoundException('Empleado no encontrado');
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
      await syncEstadoPorLicencia(tx, dto.empleadoId);
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
    const ahora = Date.now();
    return {
      id: l.id,
      empleadoId: l.empleadoId,
      desde: l.desde.toISOString(),
      hasta: l.hasta.toISOString(),
      motivo: l.motivo,
      vigente: l.desde.getTime() <= ahora && l.hasta.getTime() >= ahora,
    };
  }
}
