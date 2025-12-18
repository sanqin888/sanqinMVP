///Users/apple/sanqinMVP/apps/api/src/menu
import { Controller, Get } from '@nestjs/common';
import {
  PublicMenuService,
} from './public-menu.service';
import { PublicMenuResponse } from '@shared/menu';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get('public')
  async getPublicMenu(): Promise<PublicMenuResponse> {
    return this.service.getPublicMenu();
  }
}
