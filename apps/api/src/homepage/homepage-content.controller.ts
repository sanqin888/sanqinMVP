import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { HomepageContentService } from './homepage-content.service';
import { HomepageFeaturedService } from './homepage-featured.service';
import type {
  HomepageFeaturedItem,
  HomepageLocale,
  HomepageLocaleContent,
} from './homepage-content.types';

@Controller('homepage')
export class HomepageContentController {
  constructor(
    private readonly service: HomepageContentService,
    private readonly featuredService: HomepageFeaturedService,
  ) {}

  @Get('content')
  async getContent(
    @Query('locale') localeRaw?: string,
  ): Promise<HomepageLocaleContent> {
    const locale = this.parseLocale(localeRaw);
    return this.service.getLocaleContent(locale);
  }

  @Get('featured')
  async getFeatured(
    @Query('locale') localeRaw?: string,
  ): Promise<{ items: HomepageFeaturedItem[] }> {
    const locale = this.parseLocale(localeRaw);
    return { items: await this.featuredService.getFeatured(locale) };
  }

  private parseLocale(value?: string): HomepageLocale {
    if (value === 'zh' || value === 'en') return value;
    throw new BadRequestException('locale must be zh or en');
  }
}
