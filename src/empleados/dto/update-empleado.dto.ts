import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { CreateEmpleadoDto } from './create-empleado.dto';

/**
 * Edición de un Empleado. String vacío ("") limpia fechas, areaId y supervisorId.
 * `estado` no se edita acá: su ciclo de vida (baja lógica/reactivación) vive en su propio endpoint.
 */
export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {
  @ApiPropertyOptional({ description: 'Legajo nuevo (debe ser único)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  legajo?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  fechaNacimiento?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  fechaIngreso?: string | null;
}
