import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

export class HealthStatus {
  @ApiProperty({ example: 'ok', description: 'Estado general del servicio' })
  status!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthStatus })
  getHealth(): HealthStatus {
    return { status: 'ok' };
  }
}
