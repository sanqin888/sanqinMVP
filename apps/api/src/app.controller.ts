import { Controller, Get } from '@nestjs/common';

@Controller()             
export class AppController {
  @Get()
  getRoot() {
    return { ok: true };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
