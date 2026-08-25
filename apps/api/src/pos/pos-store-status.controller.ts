import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from './pos-device.guard';
import {
  PosStoreStatusService,
  type PosStoreStatusActionContext,
} from './pos-store-status.service';

type PosStoreStatusRequest = Request & {
  user?: { id: string; role: string };
  posDevice?: {
    deviceStableId: string;
    name: string | null;
  };
};

function actionContext(
  req: PosStoreStatusRequest,
): PosStoreStatusActionContext {
  return {
    operatorUserId: req.user?.id,
    operatorRole: req.user?.role,
    posDeviceStableId: req.posDevice?.deviceStableId,
    posDeviceName: req.posDevice?.name ?? null,
  };
}

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
    @Req() req: PosStoreStatusRequest,
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

    return this.service.pauseCustomerOrdering(
      {
        durationMinutes,
        untilTomorrow,
      },
      actionContext(req),
    );
  }

  @Post('resume')
  @HttpCode(200)
  resume(@Req() req: PosStoreStatusRequest) {
    return this.service.resumeCustomerOrdering(actionContext(req));
  }
}
