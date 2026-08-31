import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  LOYALTY_POLICY_SETTINGS_READER,
  LOYALTY_POLICY_WRITER,
  LoyaltyPolicyValidationError,
  type LoyaltyPolicySettings,
  type LoyaltyPolicySettingsReaderPort,
  type LoyaltyPolicyUpdateInput,
  type LoyaltyPolicyWriterPort,
} from '../../loyalty/public-api';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/benefits/loyalty-policy')
export class AdminLoyaltyPolicyController {
  constructor(
    @Inject(LOYALTY_POLICY_SETTINGS_READER)
    private readonly loyaltyPolicySettingsReader: LoyaltyPolicySettingsReaderPort,
    @Inject(LOYALTY_POLICY_WRITER)
    private readonly loyaltyPolicyWriter: LoyaltyPolicyWriterPort,
  ) {}

  @Get()
  @Roles('ADMIN', 'STAFF')
  getLoyaltyPolicy(): Promise<LoyaltyPolicySettings> {
    return this.loyaltyPolicySettingsReader.getLoyaltyPolicySettings();
  }

  @Patch()
  async updateLoyaltyPolicy(
    @Body() body: LoyaltyPolicyUpdateInput,
  ): Promise<LoyaltyPolicySettings> {
    try {
      return await this.loyaltyPolicyWriter.updateLoyaltyPolicy(body);
    } catch (error) {
      if (error instanceof LoyaltyPolicyValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
