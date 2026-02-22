import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return {
      status: 'ok',
      name: 'ABCRummy API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
