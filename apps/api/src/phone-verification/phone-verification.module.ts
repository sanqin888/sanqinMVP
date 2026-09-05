// apps/api/src/phone-verification/phone-verification.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneVerificationDeliveryModule } from '../messaging/public-api';
import { IdentityChallengeModule } from '../auth/challenge-engine.module';
import { PhoneVerificationController } from './phone-verification.controller';
import { PhoneVerificationService } from './phone-verification.service';

@Module({
  imports: [
    PrismaModule,
    PhoneVerificationDeliveryModule,
    IdentityChallengeModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 1,
        },
      ],
    }),
  ],
  providers: [PhoneVerificationService],
  controllers: [PhoneVerificationController],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
