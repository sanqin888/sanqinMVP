//apps/api/src/admin/pos-devices/admin-pos-devices.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminPosDevicesService } from './admin-pos-devices.service';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { SessionAuthGuard } from '../../auth/session-auth.guard';

@Controller('admin/pos-devices')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPosDevicesController {
  constructor(private readonly service: AdminPosDevicesService) {}

  @Post()
  async create(@Body() dto: CreatePosDeviceDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Patch(':id/reset-code')
  async resetEnrollmentCode(@Param('id') id: string) {
    return this.service.resetEnrollmentCode(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}