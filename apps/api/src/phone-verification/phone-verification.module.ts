// apps/api/src/phone-verification/phone-verification.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { SmsModule } from '../sms/sms.module';
import { PhoneVerificationService } from './phone-verification.service';
import { PhoneVerificationController } from './phone-verification.controller';

@Module({
  imports: [
    PrismaModule,
    SmsModule,
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
