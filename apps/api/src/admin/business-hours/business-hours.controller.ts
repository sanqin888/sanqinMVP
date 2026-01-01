// apps/api/src/business-hours/business-hours.controller.ts
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service';
import {
  type BusinessHoursResponse,
  type UpdateBusinessHoursDto,
} from './dto/business-hours.dto';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/business')
export class BusinessHoursController {
  constructor(private readonly businessHoursService: BusinessHoursService) {}

  @Get('hours')
  async getHours(): Promise<BusinessHoursResponse> {
    const hours = await this.businessHoursService.getAll();
    return { hours };
  }

  @Put('hours')
  async updateHours(
    @Body() body: UpdateBusinessHoursDto,
  ): Promise<BusinessHoursResponse> {
    const hours = await this.businessHoursService.updateAll(body.hours);
    return { hours };
  }
}
