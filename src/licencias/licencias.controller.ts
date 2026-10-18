import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  create(@Body() dto: CreateLicenciaDto): Promise<LicenciaResponse> {
    return this.licencias.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de licencias de un Empleado (más recientes primero)' })
  @ApiOkResponse({ type: [LicenciaResponse] })
  findAll(@Query() query: ListLicenciasQueryDto): Promise<LicenciaResponse[]> {
    return this.licencias.findAll(query);
  }
}
