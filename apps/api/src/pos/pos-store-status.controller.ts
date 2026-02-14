import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from './pos-device.guard';
import { PosStoreStatusService } from './pos-store-status.service';

@Controller('pos/store-status')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosStoreStatusController {
  constructor(private readonly service: PosStoreStatusService) {}

  @Get()
  getStatus() {
    return this.service.getCustomerOrderingStatus();
  }

  @Post('pause')
  @HttpCode(200)
  pause(
    @Body()
    body: {
      durationMinutes?: number;
      untilTomorrow?: boolean;
    },
  ) {
    const durationMinutes =
      typeof body.durationMinutes === 'number'
        ? Math.floor(body.durationMinutes)
        : undefined;
    const untilTomorrow = body.untilTomorrow === true;

    return this.service.pauseCustomerOrdering({
      durationMinutes,
      untilTomorrow,
    });
  }

  @Post('resume')
  @HttpCode(200)
  resume() {
    return this.service.resumeCustomerOrdering();
  }
}
