import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EstadoEmpleado, ListEmpleadosQueryDto, PaginatedEmpleados } from './empleado.dto';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';

@Injectable()
export class EmpleadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
  ) {}

  async findAll(query: ListEmpleadosQueryDto): Promise<PaginatedEmpleados> {
    const { search, areaId, estado, page = 1, pageSize = 10 } = query;
    const where: Prisma.EmpleadoWhereInput = {};
    if (areaId) where.areaId = areaId;
    if (estado) where.estado = estado;
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { legajo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.empleado.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        include: { area: { select: { id: true, nombre: true } } },
      }),
      this.prisma.empleado.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        legajo: e.legajo,
        nombre: e.nombre,
        apellido: e.apellido,
        puesto: e.puesto,
        estado: e.estado as EstadoEmpleado,
        areaId: e.area?.id ?? null,
        areaNombre: e.area?.nombre ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateEmpleadoDto, authorization?: string) {
    const autor = await this.resolveActor(authorization);
    const area = dto.areaId
      ? await this.prisma.area.findUnique({ where: { id: dto.areaId } })
      : null;
    if (dto.areaId && !area) {
      throw new UnprocessableEntityException('El Área indicada no existe');
    }
    if (dto.supervisorId) {
      const supervisor = await this.prisma.empleado.findFirst({
        where: { id: dto.supervisorId, estado: 'activo' },
      });
      if (!supervisor) {
        throw new UnprocessableEntityException('El supervisor debe ser un Empleado activo');
      }
    }

    const legajo = dto.legajo?.trim() || (await this.nextLegajo());

    try {
      const empleado = await this.prisma.empleado.create({
        data: {
          legajo,
          nombre: dto.nombre.trim(),
          apellido: dto.apellido.trim(),
          dni: dto.dni.trim(),
          fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : null,
          email: dto.email ?? null,
          telefono: dto.telefono ?? null,
          direccion: dto.direccion ?? null,
          puesto: dto.puesto ?? null,
          fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : null,
          estado: dto.estado ?? 'activo',
          areaId: dto.areaId ?? null,
          supervisorId: dto.supervisorId ?? null,
        },
      });

      await this.audit.record('create', autor, 'empleado', {
        legajo: empleado.legajo,
        dni: empleado.dni,
        nombre: empleado.nombre,
        apellido: empleado.apellido,
      });

      return {
        id: empleado.id,
        legajo: empleado.legajo,
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        puesto: empleado.puesto,
        estado: empleado.estado as EstadoEmpleado,
        areaId: area?.id ?? null,
        areaNombre: area?.nombre ?? null,
      };
    } catch (error) {
      if (this.isUniqueViolation(error, 'legajo')) {
        throw new ConflictException('Ya existe un Empleado con ese legajo');
      }
      if (this.isUniqueViolation(error, 'dni')) {
        throw new ConflictException('Ya existe un Empleado con ese DNI');
      }
      throw error;
    }
  }

  private async nextLegajo(): Promise<string> {
    let n = (await this.prisma.empleado.count()) + 1;
    for (;;) {
      const legajo = `L-${String(n).padStart(4, '0')}`;
      const existe = await this.prisma.empleado.findUnique({ where: { legajo } });
      if (!existe) return legajo;
      n += 1;
    }
  }

  private async resolveActor(authorization?: string): Promise<string | null> {
    const match = authorization?.match(/^Bearer (.+)$/);
    if (!match) return null;
    const user = await this.supabase.getUser(match[1]);
    return user.email ?? null;
  }

  private isUniqueViolation(error: unknown, field: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = error.meta?.target as string[] | undefined;
    return target?.includes(field) ?? false;
  }
}
