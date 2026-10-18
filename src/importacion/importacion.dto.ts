import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImportarCsvDto {
  @ApiProperty({ description: 'Contenido completo del CSV, con fila de encabezados' })
  @IsString()
  @IsNotEmpty()
  csv!: string;
}

export type EstadoFilaPreview = 'valida' | 'error' | 'omitida';
export type EstadoFilaConfirmacion = 'creada' | 'omitida' | 'error';

export class FilaPreview {
  @ApiProperty({ description: 'Número de fila de datos (1 = primera fila después del encabezado)' })
  fila!: number;

  @ApiProperty({ enum: ['valida', 'error', 'omitida'] })
  estado!: EstadoFilaPreview;

  @ApiProperty({ type: String, nullable: true })
  motivo!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'null si se autgenerará en la confirmación' })
  legajo!: string | null;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  apellido!: string;

  @ApiProperty()
  dni!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  area!: string | null;
}

export class ResumenPreview {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  validas!: number;

  @ApiProperty()
  errores!: number;

  @ApiProperty()
  omitidas!: number;
}

export class PreviewResponse {
  @ApiProperty({ type: [FilaPreview] })
  filas!: FilaPreview[];

  @ApiProperty({ type: ResumenPreview })
  resumen!: ResumenPreview;
}

export class FilaConfirmacion {
  @ApiProperty()
  fila!: number;

  @ApiProperty({ enum: ['creada', 'omitida', 'error'] })
  estado!: EstadoFilaConfirmacion;

  @ApiProperty({ type: String, nullable: true })
  motivo!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Legajo final del Empleado creado' })
  legajo!: string | null;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  apellido!: string;

  @ApiProperty()
  dni!: string;
}

export class ConfirmResponse {
  @ApiProperty()
  creados!: number;

  @ApiProperty()
  omitidos!: number;

  @ApiProperty()
  errores!: number;

  @ApiProperty()
  totalFilas!: number;

  @ApiProperty({ type: [FilaConfirmacion] })
  detalle!: FilaConfirmacion[];
}
