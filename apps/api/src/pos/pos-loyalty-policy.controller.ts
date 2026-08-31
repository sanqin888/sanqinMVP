import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  LOYALTY_POLICY_READER,
  type LoyaltyPolicyReaderPort,
  type LoyaltyPolicySnapshot,
} from '../loyalty/public-api';
import { PosDeviceGuard } from './pos-device.guard';

@Controller('pos/loyalty-policy')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosLoyaltyPolicyController {
  constructor(
    @Inject(LOYALTY_POLICY_READER)
    private readonly loyaltyPolicyReader: LoyaltyPolicyReaderPort,
  ) {}

  @Get()
  getPolicy(): Promise<LoyaltyPolicySnapshot> {
    return this.loyaltyPolicyReader.getLoyaltyPolicySnapshot();
  }
}
