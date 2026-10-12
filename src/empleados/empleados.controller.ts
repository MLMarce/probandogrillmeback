import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EmpleadosService } from './empleados.service';
import { EmpleadoListItem, ListEmpleadosQueryDto, PaginatedEmpleados } from './empleado.dto';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';

@ApiTags('empleados')
@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedEmpleados })
  findAll(@Query() query: ListEmpleadosQueryDto): Promise<PaginatedEmpleados> {
    return this.empleados.findAll(query);
  }

  @Post()
  @ApiCreatedResponse({ type: EmpleadoListItem })
  create(
    @Body() dto: CreateEmpleadoDto,
    @Headers('authorization') authorization?: string,
  ): Promise<EmpleadoListItem> {
    return this.empleados.create(dto, authorization);
  }
}
