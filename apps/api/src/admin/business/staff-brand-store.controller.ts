import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type {
  BrandConfigSnapshot,
  StoreBusinessHour,
  StoreConfigSnapshot,
  StoreHoliday,
} from '../../store/public-api';
import { AdminBusinessService } from './admin-business.service';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Controller('staff')
export class StaffBrandStoreController {
  constructor(private readonly service: AdminBusinessService) {}

  @Get('brand/config')
  @Roles('ADMIN')
  getBrandConfig(): Promise<BrandConfigSnapshot> {
    return this.service.getBrandConfig();
  }

  @Patch('brand/config')
  @Roles('ADMIN')
  updateBrandConfig(@Body() body: unknown): Promise<BrandConfigSnapshot> {
    return this.service.updateBrandConfig(body);
  }

  @Get('store/config')
  @Roles('ADMIN', 'STAFF')
  getStoreConfig(): Promise<StoreConfigSnapshot> {
    return this.service.getStoreConfig();
  }

  @Patch('store/config')
  @Roles('ADMIN')
  updateStoreConfig(@Body() body: unknown): Promise<StoreConfigSnapshot> {
    return this.service.updateStoreConfig(body);
  }

  @Get('store/hours')
  @Roles('ADMIN', 'STAFF')
  async getStoreHours(): Promise<{ hours: StoreBusinessHour[] }> {
    return { hours: await this.service.getStoreHours() };
  }

  @Put('store/hours')
  @Roles('ADMIN')
  async updateStoreHours(
    @Body() body: { hours?: unknown },
  ): Promise<{ hours: StoreBusinessHour[] }> {
    return { hours: await this.service.updateStoreHours(body.hours) };
  }

  @Get('store/holidays')
  @Roles('ADMIN', 'STAFF')
  async getStoreHolidays(): Promise<{ holidays: StoreHoliday[] }> {
    return { holidays: await this.service.getStoreHolidays() };
  }

  @Put('store/holidays')
  @Roles('ADMIN')
  async updateStoreHolidays(
    @Body() body: { holidays?: unknown },
  ): Promise<{ holidays: StoreHoliday[] }> {
    return { holidays: await this.service.updateStoreHolidays(body) };
  }
}
