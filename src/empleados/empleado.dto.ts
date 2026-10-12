import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const ESTADOS_EMPLEADO = ['activo', 'inactivo', 'licencia'] as const;
export type EstadoEmpleado = (typeof ESTADOS_EMPLEADO)[number];

export class ListEmpleadosQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre, apellido o legajo' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaId?: string;

  @ApiPropertyOptional({ enum: ESTADOS_EMPLEADO })
  @IsOptional()
  @IsIn(ESTADOS_EMPLEADO)
  estado?: EstadoEmpleado;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;
}

export class EmpleadoListItem {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  legajo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  apellido!: string;

  @ApiProperty({ type: String, nullable: true })
  puesto!: string | null;

  @ApiProperty({ enum: ESTADOS_EMPLEADO })
  estado!: EstadoEmpleado;

  @ApiProperty({ type: String, nullable: true })
  areaId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  areaNombre!: string | null;
}

export class PaginatedEmpleados {
  @ApiProperty({ type: [EmpleadoListItem] })
  items!: EmpleadoListItem[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
