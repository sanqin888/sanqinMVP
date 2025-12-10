// apps/api/src/business-hours/business-hours.controller.ts
import { Body, Controller, Get, Put } from '@nestjs/common';
import { BusinessHoursService } from './business-hours.service';
import {
  type BusinessHoursResponse,
  type UpdateBusinessHoursDto,
} from './dto/business-hours.dto';

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
