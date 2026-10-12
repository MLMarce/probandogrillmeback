import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AreasService } from './areas.service';
import { AreaResponse, CreateAreaDto, UpdateAreaDto } from './area.dto';

@ApiTags('areas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOkResponse({ type: [AreaResponse] })
  findAll(): Promise<AreaResponse[]> {
    return this.areas.findAll();
  }

  @Post()
  @ApiOkResponse({ type: AreaResponse })
  create(@Body() dto: CreateAreaDto): Promise<AreaResponse> {
    return this.areas.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AreaResponse })
  update(@Param('id') id: string, @Body() dto: UpdateAreaDto): Promise<AreaResponse> {
    return this.areas.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.areas.remove(id);
  }
}
