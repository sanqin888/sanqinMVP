// apps/api/src/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from './identity-prisma';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionAuthGuard } from './session-auth.guard';
import { OptionalSessionAuthGuard } from './optional-session-auth.guard';
import { OauthStateService } from './oauth/oauth-state.service';
import { GoogleStrategy } from './oauth/google.strategy';
import { GoogleStartGuard } from './oauth/google.guard';
import { PrismaService } from './identity-prisma';
import { RolesGuard } from './roles.guard';
import { MfaGuard } from './mfa.guard';
import { EmailModule } from '../email/email.module';
import { AdminMfaGuard } from './admin-mfa.guard';
import { SmsModule } from '../sms/sms.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationModule } from '../notifications/notification.module';
import { IdentityChallengeModule } from './challenge-engine.module';
import { PosDeviceModule } from '../pos/public-api';
import { CouponsModule } from '../coupons/public-api';

@Global()
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    EmailModule,
    SmsModule,
    MessagingModule,
    NotificationModule,
    IdentityChallengeModule,
    PosDeviceModule,
    CouponsModule,
  ],
  providers: [
    AuthService,
    PrismaService,
    SessionAuthGuard,
    OptionalSessionAuthGuard,
    AdminMfaGuard,
    MfaGuard,
    OauthStateService,
    GoogleStrategy,
    GoogleStartGuard,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    SessionAuthGuard,
    OptionalSessionAuthGuard,
    AdminMfaGuard,
    MfaGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
