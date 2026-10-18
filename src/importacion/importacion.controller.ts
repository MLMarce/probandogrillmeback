import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConfirmResponse,
  ImportarCsvDto,
  PreviewResponse,
} from './importacion.dto';
import { ImportacionService } from './importacion.service';

@ApiTags('importaciones')
@Controller('importaciones')
export class ImportacionController {
  constructor(private readonly importacion: ImportacionService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Valida el CSV fila por fila sin escribir nada' })
  @ApiOkResponse({ type: PreviewResponse })
  preview(@Body() dto: ImportarCsvDto): Promise<PreviewResponse> {
    return this.importacion.preview(dto);
  }

  @Post('confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inserta solo las filas válidas y devuelve el resumen' })
  @ApiOkResponse({ type: ConfirmResponse })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer <token> del Administrador de RRHH',
  })
  confirm(
    @Body() dto: ImportarCsvDto,
    @Headers('authorization') authorization?: string,
  ): Promise<ConfirmResponse> {
    return this.importacion.confirm(dto, authorization);
  }
}
