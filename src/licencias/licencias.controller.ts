import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateLicenciaDto, LicenciaResponse, ListLicenciasQueryDto } from './licencia.dto';
import { LicenciasService } from './licencias.service';

@ApiTags('licencias')
@Controller('licencias')
export class LicenciasController {
  constructor(private readonly licencias: LicenciasService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Registra una licencia; sincroniza el Estado del Empleado' })
  @ApiCreatedResponse({ type: LicenciaResponse })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer <token> del Administrador de RRHH',
  })
  create(
    @Body() dto: CreateLicenciaDto,
    @Headers('authorization') authorization?: string,
  ): Promise<LicenciaResponse> {
    return this.licencias.create(dto, authorization);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de licencias de un Empleado (más recientes primero)' })
  @ApiOkResponse({ type: [LicenciaResponse] })
  findAll(@Query() query: ListLicenciasQueryDto): Promise<LicenciaResponse[]> {
    return this.licencias.findAll(query);
  }
}
