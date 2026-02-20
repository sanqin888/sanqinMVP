import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminMfaGuard } from '../auth/admin-mfa.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

type AnalyticsIngestEventDto = {
  event?: string;
  payload?: Record<string, unknown>;
  ts?: number;
};

type AnalyticsIngestBodyDto = {
  events?: AnalyticsIngestEventDto[];
  locale?: string;
  path?: string;
};

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  async ingestEvents(
    @Body() body: AnalyticsIngestBodyDto | null | undefined,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ): Promise<{ accepted: number }> {
    const accepted = await this.analyticsService.ingestBatch(
      body?.events ?? [],
      {
        locale: body?.locale,
        path: body?.path,
        userAgent,
        ipAddress,
      },
    );

    return { accepted };
  }

  @Get('events')
  @UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF', 'ACCOUNTANT')
  async listEvents(
    @Query('limit') limit?: string,
    @Query('event') event?: string,
  ): Promise<{ items: Awaited<ReturnType<AnalyticsService['listRecent']>> }> {
    const parsedLimit = typeof limit === 'string' ? Number(limit) : undefined;
    const items = await this.analyticsService.listRecent({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      event,
    });

    return { items };
  }
}
