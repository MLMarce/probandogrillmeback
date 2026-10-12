import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ESTADOS_EMPLEADO } from '../../empleados/empleado.dto';

export class CreateEmpleadoDto {
  @ApiPropertyOptional({ description: 'Si no se provee, se autgenera secuencialmente' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  legajo?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  nombre!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  apellido!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  dni!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional({ example: 'Mantenimiento de electricidad' })
  @IsOptional()
  @IsString()
  puesto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaId?: string;

  @ApiPropertyOptional({ description: 'Id de un Empleado activo' })
  @IsOptional()
  @IsString()
  supervisorId?: string;

  @ApiPropertyOptional({ enum: ESTADOS_EMPLEADO, default: 'activo' })
  @IsOptional()
  @IsIn(ESTADOS_EMPLEADO)
  estado?: (typeof ESTADOS_EMPLEADO)[number];
}
