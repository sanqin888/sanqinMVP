//apps/api/src/loyalty/loyalty.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { MessagingModule } from '../messaging/messaging.module';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyEventProcessor } from './loyalty-event.processor';
import { LOYALTY_POLICY_READER } from './loyalty-policy.contract';

@Module({
  imports: [PrismaModule, PosDeviceModule, MessagingModule],
  providers: [
    LoyaltyService,
    {
      provide: LOYALTY_POLICY_READER,
      useExisting: LoyaltyService,
    },
    LoyaltyEventProcessor,
  ],
  controllers: [LoyaltyController],
  exports: [LoyaltyService, LOYALTY_POLICY_READER],
})
export class LoyaltyModule {}
