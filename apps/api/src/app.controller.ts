import { Controller, Get } from '@nestjs/common';

@Controller('controller')
export class AppController {
  /** GET /api */
  @Get()
  root() {
    return { ok: true };
  }

  /** GET /api/health */
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
