import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { extractBearerToken } from '../common/extract-bearer';
import { syncEstadoPorLicencia } from '../licencias/sync-estado';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  EmpleadoDetalle,
  EstadoEmpleado,
  ListEmpleadosQueryDto,
  PaginatedEmpleados,
} from './empleado.dto';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';

type EmpleadoConRelaciones = Prisma.EmpleadoGetPayload<{
  include: {
    area: { select: { id: true; nombre: true } };
    supervisor: { select: { nombre: true; apellido: true } };
  };
}>;

const DETALLE_INCLUDE = {
  area: { select: { id: true, nombre: true } },
  supervisor: { select: { nombre: true, apellido: true } },
} satisfies Prisma.EmpleadoInclude;

const CAMPOS_TEXTO = ['legajo', 'nombre', 'apellido', 'dni', 'email', 'telefono', 'direccion', 'puesto'] as const;
const CAMPOS_TEXTO_OPCIONALES = ['email', 'telefono', 'direccion', 'puesto'] as const;
const CAMPOS_FECHA = ['fechaNacimiento', 'fechaIngreso'] as const;

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
    const area = await this.assertAreaExiste(dto.areaId);
    await this.assertSupervisorValido(dto.supervisorId);

    const legajoProvisto = dto.legajo?.trim() || undefined;

    const empleado = await this.crearConLegajo(legajoProvisto, dto, area?.id ?? null);

    await this.audit.record('create', autor, 'empleado', {
      legajo: empleado.legajo,
      dni: empleado.dni,
      nombre: empleado.nombre,
      apellido: empleado.apellido,
      email: empleado.email,
      telefono: empleado.telefono,
      direccion: empleado.direccion,
      puesto: empleado.puesto,
      estado: empleado.estado,
      areaId: empleado.areaId,
      supervisorId: empleado.supervisorId,
      fechaNacimiento: empleado.fechaNacimiento,
      fechaIngreso: empleado.fechaIngreso,
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
  }

  async findById(idOLegajo: string): Promise<EmpleadoDetalle> {
    const empleado = await this.findOrThrow(idOLegajo);
    return this.toDetalle(empleado);
  }

  async darDeBaja(idOLegajo: string, authorization?: string): Promise<EmpleadoDetalle> {
    return this.transicionEstado(idOLegajo, authorization, 'inactivo');
  }

  async reactivar(idOLegajo: string, authorization?: string): Promise<EmpleadoDetalle> {
    return this.transicionEstado(idOLegajo, authorization, 'activo');
  }

  private async transicionEstado(
    idOLegajo: string,
    authorization: string | undefined,
    hacia: EstadoEmpleado,
  ): Promise<EmpleadoDetalle> {
    const autor = await this.resolveActor(authorization);
    const actual = await this.findOrThrow(idOLegajo);
    if (actual.estado === hacia) {
      throw new ConflictException(`El Empleado ya está ${hacia}`);
    }
    const accion = hacia === 'inactivo' ? 'dar de baja' : 'reactivar';
    await this.assertSinLicenciaVigente(actual.id, accion);

    const evento: 'baja' | 'update' = hacia === 'inactivo' ? 'baja' : 'update';
    await this.prisma.$transaction([
      this.prisma.empleado.update({
        where: { id: actual.id },
        data: { estado: hacia },
      }),
      this.audit.record(
        evento,
        autor,
        'empleado',
        hacia === 'inactivo'
          ? { id: actual.id, legajo: actual.legajo, antes: actual.estado, despues: hacia }
          : {
              id: actual.id,
              legajo: actual.legajo,
              cambios: [{ campo: 'estado', antes: actual.estado, despues: hacia }],
            },
      ),
    ]);

    return this.toDetalle(await this.findOrThrow(actual.id));
  }

  async update(
    idOLegajo: string,
    dto: UpdateEmpleadoDto,
    authorization?: string,
  ): Promise<EmpleadoDetalle> {
    const autor = await this.resolveActor(authorization);
    const actual = await this.findOrThrow(idOLegajo);

    let areaId = actual.areaId;
    if (dto.areaId !== undefined) {
      const nuevaAreaId = dto.areaId.trim() || null;
      if (nuevaAreaId) {
        await this.assertAreaExiste(nuevaAreaId);
      }
      areaId = nuevaAreaId;
    }

    let supervisorId = actual.supervisorId;
    if (dto.supervisorId !== undefined) {
      const nuevoSupervisorId = dto.supervisorId.trim() || null;
      if (nuevoSupervisorId !== actual.supervisorId) {
        await this.assertSupervisorValido(nuevoSupervisorId, actual.id);
      }
      supervisorId = nuevoSupervisorId;
    }

    const cambios: { campo: string; antes: string | null; despues: string | null }[] = [];
    const data: Prisma.EmpleadoUncheckedUpdateInput = {};

    for (const campo of CAMPOS_TEXTO) {
      const valorDto = dto[campo];
      if (valorDto === undefined) continue;
      const despues = valorDto.trim() || null;
      const antes = actual[campo];
      if (despues === null && !(CAMPOS_TEXTO_OPCIONALES as readonly string[]).includes(campo)) {
        throw new UnprocessableEntityException(`${campo} no puede quedar vacío`);
      }
      if (despues !== (antes ?? null)) {
        cambios.push({ campo, antes: antes ?? null, despues });
        (data as Record<string, unknown>)[campo] = despues;
      }
    }

    for (const campo of CAMPOS_FECHA) {
      const valorDto = dto[campo];
      if (valorDto === undefined) continue;
      const antes = actual[campo];
      if (valorDto === null) {
        if (antes !== null) {
          cambios.push({ campo, antes: antes?.toISOString() ?? null, despues: null });
          (data as Record<string, unknown>)[campo] = null;
        }
        continue;
      }
      const fecha = new Date(valorDto);
      if (antes?.getTime() !== fecha.getTime()) {
        cambios.push({
          campo,
          antes: antes?.toISOString() ?? null,
          despues: fecha.toISOString(),
        });
        (data as Record<string, unknown>)[campo] = fecha;
      }
    }

    if (dto.areaId !== undefined && areaId !== actual.areaId) {
      cambios.push({ campo: 'areaId', antes: actual.areaId, despues: areaId });
      data.areaId = areaId;
    }
    if (dto.supervisorId !== undefined && supervisorId !== actual.supervisorId) {
      cambios.push({ campo: 'supervisorId', antes: actual.supervisorId, despues: supervisorId });
      data.supervisorId = supervisorId;
    }

    if (cambios.length === 0) {
      return this.toDetalle(actual);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.empleado.update({ where: { id: actual.id }, data });
        await this.audit.record(
          'update',
          autor,
          'empleado',
          {
            id: actual.id,
            legajo: data.legajo ?? actual.legajo,
            cambios,
          },
          tx,
        );
        await syncEstadoPorLicencia(tx, actual.id);
      });
    } catch (error) {
      this.manejarUnicos(error);
      throw error;
    }

    return this.toDetalle(await this.findOrThrow(actual.id));
  }

  private async assertSinLicenciaVigente(empleadoId: string, accion: string) {
    const ahora = new Date();
    const licencia = await this.prisma.licencia.findFirst({
      where: {
        empleadoId,
        desde: { lte: ahora },
        hasta: { gte: ahora },
      },
    });
    if (licencia) {
      throw new ConflictException(
        `El Empleado tiene una licencia vigente: no se puede ${accion} hasta que finalice`,
      );
    }
  }

  private async assertAreaExiste(areaId?: string | null) {
    if (!areaId) return null;
    const area = await this.prisma.area.findUnique({ where: { id: areaId } });
    if (!area) {
      throw new UnprocessableEntityException('El Área indicada no existe');
    }
    return area;
  }

  private async assertSupervisorValido(supervisorId?: string | null, exceptoId?: string) {
    if (!supervisorId) return;
    if (exceptoId && supervisorId === exceptoId) {
      throw new UnprocessableEntityException('Un Empleado no puede ser su propio supervisor');
    }
    const supervisor = await this.prisma.empleado.findFirst({
      where: { id: supervisorId, estado: 'activo' },
    });
    if (!supervisor) {
      throw new UnprocessableEntityException('El supervisor debe ser un Empleado activo');
    }
  }

  private manejarUnicos(error: unknown): void {
    if (this.isUniqueViolation(error, 'legajo')) {
      throw new ConflictException('Ya existe un Empleado con ese legajo');
    }
    if (this.isUniqueViolation(error, 'dni')) {
      throw new ConflictException('Ya existe un Empleado con ese DNI');
    }
  }

  private async findOrThrow(idOLegajo: string): Promise<EmpleadoConRelaciones> {
    const empleado = await this.prisma.empleado.findFirst({
      where: { OR: [{ id: idOLegajo }, { legajo: idOLegajo }] },
      include: DETALLE_INCLUDE,
    });
    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado');
    }
    return empleado;
  }

  private toDetalle(e: EmpleadoConRelaciones): EmpleadoDetalle {
    return {
      id: e.id,
      legajo: e.legajo,
      nombre: e.nombre,
      apellido: e.apellido,
      dni: e.dni,
      fechaNacimiento: e.fechaNacimiento?.toISOString() ?? null,
      email: e.email,
      telefono: e.telefono,
      direccion: e.direccion,
      puesto: e.puesto,
      fechaIngreso: e.fechaIngreso?.toISOString() ?? null,
      estado: e.estado as EstadoEmpleado,
      areaId: e.area?.id ?? null,
      areaNombre: e.area?.nombre ?? null,
      supervisorId: e.supervisorId,
      supervisorNombre: e.supervisor ? `${e.supervisor.nombre} ${e.supervisor.apellido}` : null,
    };
  }

  private async crearConLegajo(
    legajoProvisto: string | undefined,
    dto: CreateEmpleadoDto,
    areaId: string | null,
    reintentos = 3,
  ) {
    for (let intento = 0; ; intento++) {
      const legajo = legajoProvisto ?? (await this.nextLegajo());
      try {
        return await this.prisma.empleado.create({
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
            estado: 'activo',
            areaId,
            supervisorId: dto.supervisorId ?? null,
          },
        });
      } catch (error) {
        if (
          !legajoProvisto &&
          this.isUniqueViolation(error, 'legajo') &&
          intento < reintentos
        ) {
          continue;
        }
        this.manejarUnicos(error);
        throw error;
      }
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
    const token = extractBearerToken(authorization);
    if (!token) return null;
    const user = await this.supabase.getUser(token);
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
