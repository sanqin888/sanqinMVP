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
import { AdminMfaGuard } from './admin-mfa.guard';
import { AuthChallengeDeliveryModule } from '../messaging/public-api';
import { NotificationModule } from '../notifications/public-api';
import { IdentityChallengeModule } from './challenge-engine.module';
import { PosDeviceModule } from '../pos/public-api';
import { CouponsModule } from '../coupons/public-api';
import {
  STAFF_INVITE_DELIVERY,
  StaffInviteDeliveryModule,
  type StaffInviteDeliveryPort,
} from '../email/public-api';
import { STAFF_ADMINISTRATION } from './staff-administration.contract';
import { StaffAdministrationService } from './staff-administration.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    AuthChallengeDeliveryModule,
    NotificationModule,
    IdentityChallengeModule,
    PosDeviceModule,
    CouponsModule,
    StaffInviteDeliveryModule,
  ],
  providers: [
    AuthService,
    {
      provide: StaffAdministrationService,
      useFactory: (
        prisma: PrismaService,
        authService: AuthService,
        staffInviteDelivery: StaffInviteDeliveryPort,
      ) =>
        new StaffAdministrationService(
          prisma,
          authService,
          staffInviteDelivery,
        ),
      inject: [PrismaService, AuthService, STAFF_INVITE_DELIVERY],
    },
    {
      provide: STAFF_ADMINISTRATION,
      useExisting: StaffAdministrationService,
    },
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
    STAFF_ADMINISTRATION,
    SessionAuthGuard,
    OptionalSessionAuthGuard,
    AdminMfaGuard,
    MfaGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
