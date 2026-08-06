import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { UberAuthService } from './uber-auth.service';
import { UberEatsController } from './ubereats.controller';
import { UberEatsService } from './ubereats.service';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';

@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [UberEatsController],
  providers: [UberEatsService, UberAuthService],
  exports: [UberAuthService, UberEatsService],
})
export class UberEatsModule {}
