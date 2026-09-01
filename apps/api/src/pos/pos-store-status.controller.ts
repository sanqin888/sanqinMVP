import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedPosIdentity } from './pos-device-management.contract';
import { PosDeviceGuard } from './pos-device.guard';
import {
  PosStoreStatusService,
  type PosStoreStatusActionContext,
} from './pos-store-status.service';

type PosStoreStatusRequest = Request & {
  user?: { id: string; role: string };
  posDevice?: AuthenticatedPosIdentity;
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

function requireStoreStableId(req: PosStoreStatusRequest): string {
  const storeStableId = req.posDevice?.storeStableId?.trim();
  if (!storeStableId) {
    throw new UnauthorizedException('POS device store unavailable');
  }
  return storeStableId;
}

@Controller('pos/store-status')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosStoreStatusController {
  constructor(private readonly service: PosStoreStatusService) {}

  @Get()
  getStatus(@Req() req: PosStoreStatusRequest) {
    return this.service.getCustomerOrderingStatus(requireStoreStableId(req));
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
      requireStoreStableId(req),
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
    return this.service.resumeCustomerOrdering(
      requireStoreStableId(req),
      actionContext(req),
    );
  }
}
