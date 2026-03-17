import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UberEatsController } from './ubereats.controller';
import { UberEatsService } from './ubereats.service';

@Module({
  imports: [PrismaModule],
  controllers: [UberEatsController],
  providers: [UberEatsService],
})
export class UberEatsModule {}
