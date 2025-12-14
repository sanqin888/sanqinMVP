import { Controller, Get } from '@nestjs/common';
import { PublicMenuService, type PublicMenuCategoryDto } from './public-menu.service';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get('public')
  async getPublicMenu(): Promise<PublicMenuCategoryDto[]> {
    return this.service.getPublicMenu();
  }
}
