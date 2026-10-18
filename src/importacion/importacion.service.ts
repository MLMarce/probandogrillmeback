import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { isEmail, isISO8601 } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { resolveActor } from '../common/resolve-actor';
import { CreateEmpleadoDto } from '../empleados/dto/create-empleado.dto';
import { EmpleadosService } from '../empleados/empleados.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { parseCsv } from './csv';
import {
  ConfirmResponse,
  FilaConfirmacion,
  FilaPreview,
  ImportarCsvDto,
  PreviewResponse,
} from './importacion.dto';

const COLUMNAS_REQUERIDAS = ['nombre', 'apellido', 'dni'];
const COLUMNAS_CONOCIDAS = [
  'legajo',
  'nombre',
  'apellido',
  'dni',
  'email',
  'telefono',
  'direccion',
  'puesto',
  'fechanacimiento',
  'fechaingreso',
  'area',
];

interface FilaCruda {
  fila: number;
  datos: Record<string, string>;
}

interface FilaValidada {
  fila: number;
  estado: 'valida' | 'error' | 'omitida';
  motivo: string | null;
  legajo: string | null;
  nombre: string;
  apellido: string;
  dni: string;
  email: string | null;
  area: string | null;
  areaId: string | null;
  telefono: string | null;
  direccion: string | null;
  puesto: string | null;
  fechaNacimiento: string | null;
  fechaIngreso: string | null;
}

@Injectable()
export class ImportacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseService,
    private readonly empleados: EmpleadosService,
  ) {}

  async preview(dto: ImportarCsvDto): Promise<PreviewResponse> {
    const filas = this.leerFilas(dto.csv);
    const validadas = await this.validar(filas);
    const filasPreview: FilaPreview[] = validadas.map((v) => ({
      fila: v.fila,
      estado: v.estado,
      motivo: v.motivo,
      legajo: v.legajo,
      nombre: v.nombre,
      apellido: v.apellido,
      dni: v.dni,
      email: v.email,
      area: v.area,
    }));
    return {
      filas: filasPreview,
      resumen: {
        total: validadas.length,
        validas: validadas.filter((v) => v.estado === 'valida').length,
        errores: validadas.filter((v) => v.estado === 'error').length,
        omitidas: validadas.filter((v) => v.estado === 'omitida').length,
      },
    };
  }

  async confirm(dto: ImportarCsvDto, authorization?: string): Promise<ConfirmResponse> {
    const filas = this.leerFilas(dto.csv);
    const validadas = await this.validar(filas);
    const autor = await resolveActor(this.supabase, authorization);

    const detalle: FilaConfirmacion[] = [];
    let creados = 0;
    let omitidos = 0;
    let errores = 0;

    for (const fila of validadas) {
      if (fila.estado !== 'valida') {
        detalle.push({
          fila: fila.fila,
          estado: fila.estado === 'omitida' ? 'omitida' : 'error',
          motivo: fila.motivo,
          legajo: null,
          nombre: fila.nombre,
          apellido: fila.apellido,
          dni: fila.dni,
        });
        if (fila.estado === 'omitida') omitidos += 1;
        else errores += 1;
        continue;
      }
      try {
        const empleado = await this.empleados.create(this.toDto(fila), authorization);
        creados += 1;
        detalle.push({
          fila: fila.fila,
          estado: 'creada',
          motivo: null,
          legajo: empleado.legajo,
          nombre: fila.nombre,
          apellido: fila.apellido,
          dni: fila.dni,
        });
      } catch (error) {
        if (error instanceof ConflictException) {
          // Carrera entre preview y confirmación: el duplicado se omite y se reporta.
          omitidos += 1;
          detalle.push({
            fila: fila.fila,
            estado: 'omitida',
            motivo: error.message,
            legajo: null,
            nombre: fila.nombre,
            apellido: fila.apellido,
            dni: fila.dni,
          });
          continue;
        }
        if (
          error instanceof UnprocessableEntityException ||
          error instanceof NotFoundException
        ) {
          // Ej.: el Área fue borrada entre la validación y la inserción.
          errores += 1;
          detalle.push({
            fila: fila.fila,
            estado: 'error',
            motivo: error.message,
            legajo: null,
            nombre: fila.nombre,
            apellido: fila.apellido,
            dni: fila.dni,
          });
          continue;
        }
        throw error;
      }
    }

    await this.audit.record('importacion', autor, 'empleado', {
      totalFilas: validadas.length,
      creados,
      omitidos,
      errores,
    });

    return { creados, omitidos, errores, totalFilas: validadas.length, detalle };
  }

  private leerFilas(csv: string): FilaCruda[] {
    const { headers, filas } = parseCsv(csv);
    const cols = headers.map((h) => h.trim().toLowerCase());
    for (const requerida of COLUMNAS_REQUERIDAS) {
      if (!cols.includes(requerida)) {
        throw new UnprocessableEntityException(
          `El CSV debe incluir las columnas: ${COLUMNAS_REQUERIDAS.join(', ')}`,
        );
      }
    }
    if (filas.length === 0) {
      throw new UnprocessableEntityException('El CSV no tiene filas de datos');
    }
    return filas.map((valores, index) => {
      const datos: Record<string, string> = {};
      cols.forEach((col, i) => {
        if (COLUMNAS_CONOCIDAS.includes(col)) {
          datos[col] = (valores[i] ?? '').trim();
        }
      });
      return { fila: index + 1, datos };
    });
  }

  private async validar(filas: FilaCruda[]): Promise<FilaValidada[]> {
    const [existentes, areas] = await Promise.all([
      this.prisma.empleado.findMany({ select: { legajo: true, dni: true } }),
      this.prisma.area.findMany({ select: { id: true, nombreNorm: true } }),
    ]);
    const legajosExistentes = new Set(existentes.map((e) => e.legajo));
    const dnisExistentes = new Set(existentes.map((e) => e.dni));
    const areasPorNorm = new Map(areas.map((a) => [a.nombreNorm, a.id]));
    const legajosCsv = new Set<string>();
    const dnisCsv = new Set<string>();

    return filas.map(({ fila, datos }) => {
      const valor = (col: string) => (datos[col] ?? '').trim();
      const base = {
        fila,
        legajo: valor('legajo') || null,
        nombre: valor('nombre'),
        apellido: valor('apellido'),
        dni: valor('dni'),
        email: valor('email') || null,
        area: valor('area') || null,
        areaId: null as string | null,
        telefono: valor('telefono') || null,
        direccion: valor('direccion') || null,
        puesto: valor('puesto') || null,
        fechaNacimiento: valor('fechanacimiento') || null,
        fechaIngreso: valor('fechaingreso') || null,
      };

      if (!base.nombre || !base.apellido || !base.dni) {
        return {
          ...base,
          estado: 'error' as const,
          motivo: 'Faltan campos requeridos (nombre, apellido, dni)',
        };
      }
      if (base.email && !isEmail(base.email)) {
        return { ...base, estado: 'error' as const, motivo: 'Email inválido' };
      }
      if (base.fechaNacimiento && !isISO8601(base.fechaNacimiento)) {
        return { ...base, estado: 'error' as const, motivo: 'Fecha de nacimiento inválida' };
      }
      if (base.fechaIngreso && !isISO8601(base.fechaIngreso)) {
        return { ...base, estado: 'error' as const, motivo: 'Fecha de ingreso inválida' };
      }
      if (base.area) {
        const areaId = areasPorNorm.get(base.area.toLowerCase());
        if (!areaId) {
          return { ...base, estado: 'error' as const, motivo: `El Área "${base.area}" no existe` };
        }
        base.areaId = areaId;
      }
      if (base.legajo && (legajosExistentes.has(base.legajo) || legajosCsv.has(base.legajo))) {
        return {
          ...base,
          estado: 'omitida' as const,
          motivo: `El legajo "${base.legajo}" ya existe`,
        };
      }
      if (dnisExistentes.has(base.dni) || dnisCsv.has(base.dni)) {
        return { ...base, estado: 'omitida' as const, motivo: `El DNI "${base.dni}" ya existe` };
      }
      if (base.legajo) legajosCsv.add(base.legajo);
      dnisCsv.add(base.dni);
      return { ...base, estado: 'valida' as const, motivo: null };
    });
  }

  private toDto(fila: FilaValidada): CreateEmpleadoDto {
    const dto: CreateEmpleadoDto = {
      nombre: fila.nombre,
      apellido: fila.apellido,
      dni: fila.dni,
    };
    if (fila.legajo) dto.legajo = fila.legajo;
    if (fila.email) dto.email = fila.email;
    if (fila.telefono) dto.telefono = fila.telefono;
    if (fila.direccion) dto.direccion = fila.direccion;
    if (fila.puesto) dto.puesto = fila.puesto;
    if (fila.fechaNacimiento) dto.fechaNacimiento = fila.fechaNacimiento;
    if (fila.fechaIngreso) dto.fechaIngreso = fila.fechaIngreso;
    if (fila.areaId) dto.areaId = fila.areaId;
    return dto;
  }
}
