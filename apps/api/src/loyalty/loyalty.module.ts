import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [PrismaModule],
  providers: [LoyaltyService],
  controllers: [LoyaltyController],
  exports: [LoyaltyService], // 🔑 暴露给其他模块使用
})
export class LoyaltyModule {}
