import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLicenciaDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  empleadoId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  desde!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  hasta!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class ListLicenciasQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Type(() => String)
  empleadoId!: string;
}

export class LicenciaResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  empleadoId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  desde!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  hasta!: string;

  @ApiProperty({ type: String, nullable: true })
  motivo!: string | null;

  @ApiProperty({ description: 'desde ≤ hoy ≤ hasta' })
  vigente!: boolean;
}
