// apps/api/src/phone-verification/phone-verification.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneVerificationDeliveryModule } from '../messaging/public-api';
import { PhoneVerificationService } from './phone-verification.service';
import { PhoneVerificationController } from './phone-verification.controller';
import { IdentityChallengeModule } from '../auth/public-api';

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
