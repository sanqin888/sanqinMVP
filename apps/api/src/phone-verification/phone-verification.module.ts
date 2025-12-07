// apps/api/src/phone-verification/phone-verification.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneVerificationService } from './phone-verification.service';
import { PhoneVerificationController } from './phone-verification.controller';

@Module({
  imports: [PrismaModule],
  providers: [PhoneVerificationService],
  controllers: [PhoneVerificationController],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
