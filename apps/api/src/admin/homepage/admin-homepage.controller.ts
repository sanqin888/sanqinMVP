import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { HomepageContentService } from '../../homepage/homepage-content.service';
import type {
  HomepageContentDocument,
  HomepageLocale,
  HomepageLocaleContent,
} from '../../homepage/homepage-content.types';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/homepage')
export class AdminHomepageController {
  constructor(private readonly service: HomepageContentService) {}

  @Get('content')
  async getContent(
    @Query('locale') localeRaw?: string,
  ): Promise<HomepageLocaleContent | HomepageContentDocument> {
    if (!localeRaw) return this.service.getDocument();
    return this.service.getLocaleContent(this.parseLocale(localeRaw));
  }

  @Put('content/:locale')
  async updateContent(
    @Param('locale') localeRaw: string,
    @Body() body: Partial<HomepageLocaleContent>,
  ): Promise<HomepageLocaleContent> {
    return this.service.updateLocaleContent(this.parseLocale(localeRaw), body);
  }

  private parseLocale(value: string): HomepageLocale {
    if (value === 'zh' || value === 'en') return value;
    throw new BadRequestException('locale must be zh or en');
  }
}
