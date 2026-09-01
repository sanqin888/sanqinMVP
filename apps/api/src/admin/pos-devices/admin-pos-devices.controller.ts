//apps/api/src/admin/pos-devices/admin-pos-devices.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { UpdatePosDeviceStatusDto } from './dto/update-pos-device-status.dto';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  POS_DEVICE_ADMIN_COMPATIBILITY,
  POS_DEVICE_MANAGEMENT,
  PosDeviceNotFoundError,
  PosDeviceStoreUnavailableError,
  type PosDeviceAdminCompatibilityPort,
  type PosDeviceManagementPort,
} from '../../pos/public-api';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('admin/pos-devices')
@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPosDevicesController {
  private readonly logger = new Logger(AdminPosDevicesController.name);

  constructor(
    @Inject(POS_DEVICE_MANAGEMENT)
    private readonly management: PosDeviceManagementPort,
    @Inject(POS_DEVICE_ADMIN_COMPATIBILITY)
    private readonly compatibility: PosDeviceAdminCompatibilityPort,
  ) {}

  private mapOwnerError(error: unknown): never {
    if (error instanceof PosDeviceStoreUnavailableError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof PosDeviceNotFoundError) {
      throw new NotFoundException(error.message);
    }
    throw error;
  }

  private async resolveDeviceStableId(deviceIdentifier: string): Promise<string> {
    if (!UUID_PATTERN.test(deviceIdentifier)) return deviceIdentifier;

    // @compat pos-device.admin-db-id.v1
    this.logger.log({
      event: 'pos_device_admin_compatibility_used',
      mode: 'legacy_device_db_id',
    });
    return this.compatibility.resolveDeviceStableId(deviceIdentifier);
  }

  @Post()
  async create(@Body() dto: CreatePosDeviceDto) {
    try {
      const explicitStoreStableId = dto.storeStableId?.trim();
      if (!explicitStoreStableId) {
        // @compat pos-device.admin-db-id.v1
        this.logger.log({
          event: 'pos_device_admin_compatibility_used',
          mode: dto.storeId ? 'legacy_store_db_id' : 'implicit_default_store',
        });
      }
      const storeStableId =
        explicitStoreStableId ||
        // @compat pos-device.admin-db-id.v1
        (await this.compatibility.resolveStoreStableId(dto.storeId));

      return await this.management.createDevice({
        storeStableId,
        name: dto.name.trim(),
      });
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Get()
  async findAll(@Query('storeStableId') storeStableId?: string) {
    try {
      const requestedStoreStableId = storeStableId?.trim();
      if (requestedStoreStableId) {
        return await this.management.listDevicesByStore(requestedStoreStableId);
      }

      // @compat pos-device.admin-db-id.v1
      this.logger.log({
        event: 'pos_device_admin_compatibility_used',
        mode: 'legacy_unscoped_list',
      });
      const devices = await this.compatibility.listDevices();
      return devices.map((device) => ({
        ...device,
        id: device.deviceStableId,
        storeId: device.storeStableId,
      }));
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Patch(':id/reset-code')
  async resetEnrollmentCode(@Param('id') deviceIdentifier: string) {
    try {
      const deviceStableId = await this.resolveDeviceStableId(deviceIdentifier);
      return await this.management.resetEnrollmentCode(deviceStableId);
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') deviceIdentifier: string,
    @Body() dto: UpdatePosDeviceStatusDto,
  ) {
    try {
      const deviceStableId = await this.resolveDeviceStableId(deviceIdentifier);
      return await this.management.updateDeviceStatus(
        deviceStableId,
        dto.status,
      );
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Delete(':id')
  async delete(@Param('id') deviceIdentifier: string) {
    try {
      const deviceStableId = await this.resolveDeviceStableId(deviceIdentifier);
      await this.management.deleteDevice(deviceStableId);
      return { deviceStableId };
    } catch (error) {
      this.mapOwnerError(error);
    }
  }
}
