import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UberAuthService } from './uber-auth.service';
import { UberEatsController } from './ubereats.controller';
import { UberEatsService } from './ubereats.service';

@Module({
  imports: [PrismaModule],
  controllers: [UberEatsController],
  providers: [UberEatsService, UberAuthService],
  exports: [UberAuthService, UberEatsService],
})
export class UberEatsModule {}
