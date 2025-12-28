import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PosDeviceService } from './pos-device.service';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from './pos-device.constants';

@Injectable()
export class PosDeviceGuard implements CanActivate {
  constructor(private readonly posDeviceService: PosDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Partial<Record<string, string>> | undefined;
    const deviceStableId = cookies?.[POS_DEVICE_ID_COOKIE];
    const deviceKey = cookies?.[POS_DEVICE_KEY_COOKIE];

    if (typeof deviceStableId !== 'string' || typeof deviceKey !== 'string') {
      throw new UnauthorizedException('Missing POS device credentials');
    }

    const device = await this.posDeviceService.verifyDevice({
      deviceStableId,
      deviceKey,
    });

    if (!device) {
      throw new UnauthorizedException('Invalid POS device credentials');
    }

    (req as Request & { posDevice?: typeof device }).posDevice = device;
    return true;
  }
}
