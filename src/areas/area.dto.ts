import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Mantenimiento' })
  @IsString()
  @MinLength(2)
  nombre!: string;

  @ApiPropertyOptional({ description: 'Id de un Empleado activo que supervisa el Área' })
  @IsOptional()
  @IsString()
  supervisorId?: string;
}

export class UpdateAreaDto {
  @ApiPropertyOptional({ example: 'Mantenimiento' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Id de un Empleado activo; null para quitar',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  supervisorId?: string | null;
}

export class AreaResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  supervisorId!: string | null;
}
