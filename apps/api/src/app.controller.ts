import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET /api/v1 */
  @Get()
  root() {
    return this.appService.root();
  }

  /** GET /api/v1/health */
  @Get('health')
  health() {
    return this.appService.health();
  }
}
