//apps/api/src/admin/pos-devices/admin-pos-devices.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
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
  POS_DEVICE_MANAGEMENT,
  PosDeviceNotFoundError,
  PosDeviceStoreUnavailableError,
  type PosDeviceManagementPort,
} from '../../pos/public-api';

@Controller('admin/pos-devices')
@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPosDevicesController {
  constructor(
    @Inject(POS_DEVICE_MANAGEMENT)
    private readonly management: PosDeviceManagementPort,
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

  @Post()
  async create(@Body() dto: CreatePosDeviceDto) {
    try {
      const storeStableId = dto.storeStableId.trim();
      if (!storeStableId) {
        throw new BadRequestException('storeStableId is required');
      }

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
      if (!requestedStoreStableId) {
        throw new BadRequestException('storeStableId is required');
      }
      return await this.management.listDevicesByStore(requestedStoreStableId);
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Patch(':deviceStableId/reset-code')
  async resetEnrollmentCode(@Param('deviceStableId') deviceStableId: string) {
    try {
      return await this.management.resetEnrollmentCode(deviceStableId);
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Patch(':deviceStableId/status')
  async updateStatus(
    @Param('deviceStableId') deviceStableId: string,
    @Body() dto: UpdatePosDeviceStatusDto,
  ) {
    try {
      return await this.management.updateDeviceStatus(
        deviceStableId,
        dto.status,
      );
    } catch (error) {
      this.mapOwnerError(error);
    }
  }

  @Delete(':deviceStableId')
  async delete(@Param('deviceStableId') deviceStableId: string) {
    try {
      await this.management.deleteDevice(deviceStableId);
      return { deviceStableId };
    } catch (error) {
      this.mapOwnerError(error);
    }
  }
}
