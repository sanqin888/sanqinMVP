import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import {
  InvalidStoreDirectoryInputError,
  resolveConfiguredStoreStableId,
  StoreDirectoryService,
  StoreStableIdAlreadyExistsError,
  type BrandConfigSnapshot,
  type StoreBusinessHour,
  type StoreConfigSnapshot,
  type StoreDirectoryEntry,
  type StoreHoliday,
} from '../../store/public-api';
import { AdminBusinessService } from './admin-business.service';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Controller('staff')
export class StaffBrandStoreController {
  constructor(
    private readonly service: AdminBusinessService,
    private readonly storeDirectory: StoreDirectoryService,
  ) {}

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

  @Get('stores')
  @Roles('ADMIN', 'STAFF')
  listStores(): Promise<StoreDirectoryEntry[]> {
    return this.storeDirectory.listStores();
  }

  @Post('stores')
  @Roles('ADMIN')
  async createStore(@Body() body: unknown): Promise<StoreConfigSnapshot> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('store payload must be an object');
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.storeName !== 'string' ||
      typeof input.storeStableId !== 'string'
    ) {
      throw new BadRequestException(
        'storeName and storeStableId must be strings',
      );
    }

    try {
      return await this.storeDirectory.createStore({
        storeName: input.storeName,
        storeStableId: input.storeStableId,
      });
    } catch (error) {
      if (error instanceof InvalidStoreDirectoryInputError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof StoreStableIdAlreadyExistsError) {
        throw new ConflictException('storeStableId already exists');
      }
      throw error;
    }
  }

  @Get('stores/:storeStableId/config')
  @Roles('ADMIN', 'STAFF')
  getStoreConfigByStableId(
    @Param('storeStableId') storeStableId: string,
  ): Promise<StoreConfigSnapshot> {
    return this.service.getStoreConfig(storeStableId);
  }

  @Patch('stores/:storeStableId/config')
  @Roles('ADMIN')
  updateStoreConfigByStableId(
    @Param('storeStableId') storeStableId: string,
    @Body() body: unknown,
  ): Promise<StoreConfigSnapshot> {
    return this.service.updateStoreConfig(body, storeStableId);
  }

  @Get('stores/:storeStableId/hours')
  @Roles('ADMIN', 'STAFF')
  async getStoreHoursByStableId(
    @Param('storeStableId') storeStableId: string,
  ): Promise<{ hours: StoreBusinessHour[] }> {
    return { hours: await this.service.getStoreHours(storeStableId) };
  }

  @Put('stores/:storeStableId/hours')
  @Roles('ADMIN')
  async updateStoreHoursByStableId(
    @Param('storeStableId') storeStableId: string,
    @Body() body: { hours?: unknown },
  ): Promise<{ hours: StoreBusinessHour[] }> {
    return {
      hours: await this.service.updateStoreHours(body.hours, storeStableId),
    };
  }

  @Get('stores/:storeStableId/holidays')
  @Roles('ADMIN', 'STAFF')
  async getStoreHolidaysByStableId(
    @Param('storeStableId') storeStableId: string,
  ): Promise<{ holidays: StoreHoliday[] }> {
    return { holidays: await this.service.getStoreHolidays(storeStableId) };
  }

  @Put('stores/:storeStableId/holidays')
  @Roles('ADMIN')
  async updateStoreHolidaysByStableId(
    @Param('storeStableId') storeStableId: string,
    @Body() body: { holidays?: unknown },
  ): Promise<{ holidays: StoreHoliday[] }> {
    return {
      holidays: await this.service.updateStoreHolidays(body, storeStableId),
    };
  }

  // @compat brand-store.default-store-identity.v1
  @Get('store/config')
  @Roles('ADMIN', 'STAFF')
  getStoreConfig(): Promise<StoreConfigSnapshot> {
    return this.service.getStoreConfig(resolveConfiguredStoreStableId());
  }

  @Patch('store/config')
  @Roles('ADMIN')
  updateStoreConfig(@Body() body: unknown): Promise<StoreConfigSnapshot> {
    return this.service.updateStoreConfig(
      body,
      resolveConfiguredStoreStableId(),
    );
  }

  @Get('store/hours')
  @Roles('ADMIN', 'STAFF')
  async getStoreHours(): Promise<{ hours: StoreBusinessHour[] }> {
    return {
      hours: await this.service.getStoreHours(resolveConfiguredStoreStableId()),
    };
  }

  @Put('store/hours')
  @Roles('ADMIN')
  async updateStoreHours(
    @Body() body: { hours?: unknown },
  ): Promise<{ hours: StoreBusinessHour[] }> {
    return {
      hours: await this.service.updateStoreHours(
        body.hours,
        resolveConfiguredStoreStableId(),
      ),
    };
  }

  @Get('store/holidays')
  @Roles('ADMIN', 'STAFF')
  async getStoreHolidays(): Promise<{ holidays: StoreHoliday[] }> {
    return {
      holidays: await this.service.getStoreHolidays(
        resolveConfiguredStoreStableId(),
      ),
    };
  }

  @Put('store/holidays')
  @Roles('ADMIN')
  async updateStoreHolidays(
    @Body() body: { holidays?: unknown },
  ): Promise<{ holidays: StoreHoliday[] }> {
    return {
      holidays: await this.service.updateStoreHolidays(
        body,
        resolveConfiguredStoreStableId(),
      ),
    };
  }
}
