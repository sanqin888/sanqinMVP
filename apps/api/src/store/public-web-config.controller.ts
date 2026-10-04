import { Controller, Get } from '@nestjs/common';
import {
  PublicWebConfigService,
  type PublicWebConfig,
} from './public-web-config.service';

@Controller('public')
export class PublicWebConfigController {
  constructor(private readonly service: PublicWebConfigService) {}

  @Get('web-config')
  getConfig(): Promise<PublicWebConfig> {
    return this.service.getConfig();
  }
}
