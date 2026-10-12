import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AreaResponse, CreateAreaDto, UpdateAreaDto } from './area.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AreaResponse[]> {
    const areas = await this.prisma.area.findMany({ orderBy: { nombre: 'asc' } });
    return areas.map((a) => ({ id: a.id, nombre: a.nombre, supervisorId: a.supervisorId }));
  }

  async create(dto: CreateAreaDto): Promise<AreaResponse> {
    await this.assertSupervisorActivo(dto.supervisorId);
    const data: Prisma.AreaCreateInput = {
      nombre: dto.nombre.trim(),
      nombreNorm: this.normalize(dto.nombre),
    };
    if (dto.supervisorId) {
      data.supervisor = { connect: { id: dto.supervisorId } };
    }
    try {
      const area = await this.prisma.area.create({ data });
      return { id: area.id, nombre: area.nombre, supervisorId: area.supervisorId };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un Área con ese nombre');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateAreaDto): Promise<AreaResponse> {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Área no encontrada');
    if (dto.supervisorId !== undefined && dto.supervisorId !== null) {
      await this.assertSupervisorActivo(dto.supervisorId);
    }
    const data: Prisma.AreaUpdateInput = {};
    if (dto.nombre !== undefined) {
      data.nombre = dto.nombre.trim();
      data.nombreNorm = this.normalize(dto.nombre);
    }
    if (dto.supervisorId !== undefined) {
      data.supervisor = dto.supervisorId === null
        ? { disconnect: true }
        : { connect: { id: dto.supervisorId } };
    }
    try {
      const updated = await this.prisma.area.update({ where: { id }, data });
      return { id: updated.id, nombre: updated.nombre, supervisorId: updated.supervisorId };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un Área con ese nombre');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Área no encontrada');
    const empleados = await this.prisma.empleado.count({ where: { areaId: id } });
    if (empleados > 0) {
      throw new ConflictException('El área todavía tiene Empleados asignados');
    }
    await this.prisma.area.delete({ where: { id } });
  }

  private normalize(nombre: string): string {
    return nombre.trim().toLowerCase();
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  private async assertSupervisorActivo(supervisorId?: string): Promise<void> {
    if (!supervisorId) return;
    const supervisor = await this.prisma.empleado.findFirst({
      where: { id: supervisorId, estado: 'activo' },
    });
    if (!supervisor) {
      throw new UnprocessableEntityException('El supervisor debe ser un Empleado activo');
    }
  }
}
