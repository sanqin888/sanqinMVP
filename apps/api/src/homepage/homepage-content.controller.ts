import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { HomepageContentService } from './homepage-content.service';
import type {
  HomepageLocale,
  HomepageLocaleContent,
} from './homepage-content.types';

@Controller('homepage')
export class HomepageContentController {
  constructor(private readonly service: HomepageContentService) {}

  @Get('content')
  async getContent(
    @Query('locale') localeRaw?: string,
  ): Promise<HomepageLocaleContent> {
    const locale = this.parseLocale(localeRaw);
    return this.service.getLocaleContent(locale);
  }

  private parseLocale(value?: string): HomepageLocale {
    if (value === 'zh' || value === 'en') return value;
    throw new BadRequestException('locale must be zh or en');
  }
}
