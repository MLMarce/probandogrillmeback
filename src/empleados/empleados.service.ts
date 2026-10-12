import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListEmpleadosQueryDto, PaginatedEmpleados, EstadoEmpleado } from './empleado.dto';

@Injectable()
export class EmpleadosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListEmpleadosQueryDto): Promise<PaginatedEmpleados> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.empleado.findMany({
        where,
        include: { area: { select: { id: true, nombre: true } } },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.empleado.count({ where }),
    ]);

    return {
      items: rows.map((e) => ({
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

  private buildWhere(query: ListEmpleadosQueryDto): Prisma.EmpleadoWhereInput {
    const where: Prisma.EmpleadoWhereInput = {};
    if (query.areaId) where.areaId = query.areaId;
    if (query.estado) where.estado = query.estado;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { legajo: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
