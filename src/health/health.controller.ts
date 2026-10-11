import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export class HealthStatus {
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
