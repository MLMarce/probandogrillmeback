import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { EmpleadosService } from './empleados.service';
import { ListEmpleadosQueryDto, PaginatedEmpleados } from './empleado.dto';

@ApiTags('empleados')
@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedEmpleados })
  findAll(@Query() query: ListEmpleadosQueryDto): Promise<PaginatedEmpleados> {
    return this.empleados.findAll(query);
  }
}
