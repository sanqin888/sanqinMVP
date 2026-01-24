//apps/api/src/loyalty/loyalty.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyEventProcessor } from './loyalty-event.processor';

@Module({
  imports: [PrismaModule, PosDeviceModule],
  providers: [LoyaltyService, LoyaltyEventProcessor],
  controllers: [LoyaltyController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
