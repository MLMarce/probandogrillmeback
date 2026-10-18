import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EmpleadosService } from './empleados.service';
import {
  EmpleadoDetalle,
  EmpleadoListItem,
  ListEmpleadosQueryDto,
  PaginatedEmpleados,
} from './empleado.dto';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';

@ApiTags('empleados')
@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedEmpleados })
  findAll(@Query() query: ListEmpleadosQueryDto): Promise<PaginatedEmpleados> {
    return this.empleados.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa por id o legajo' })
  @ApiOkResponse({ type: EmpleadoDetalle })
  findById(@Param('id') idOLegajo: string): Promise<EmpleadoDetalle> {
    return this.empleados.findById(idOLegajo);
  }

  @Post()
  @ApiCreatedResponse({ type: EmpleadoListItem })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer <token> del Administrador de RRHH',
  })
  create(
    @Body() dto: CreateEmpleadoDto,
    @Headers('authorization') authorization?: string,
  ): Promise<EmpleadoListItem> {
    return this.empleados.create(dto, authorization);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita campos; registra en auditoría los cambios' })
  @ApiOkResponse({ type: EmpleadoDetalle })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer <token> del Administrador de RRHH',
  })
  update(
    @Param('id') idOLegajo: string,
    @Body() dto: UpdateEmpleadoDto,
    @Headers('authorization') authorization?: string,
  ): Promise<EmpleadoDetalle> {
    return this.empleados.update(idOLegajo, dto, authorization);
  }
}
