import { Inject, Injectable } from '@nestjs/common';
import { normalizePhone } from '../../common/utils/phone';
import {
  COUPON_OFFER_ADMIN,
  type CouponOfferAdminPort,
  type CouponProgramAdminInput,
  type CouponTemplateAdminInput,
} from '../../coupons/public-api';
import {
  COUPON_PROGRAM_ADMIN_ISSUER,
  type CouponProgramAdminIssuerPort,
} from '../../benefits/public-api';

@Injectable()
export class AdminCouponsService {
  constructor(
    @Inject(COUPON_OFFER_ADMIN)
    private readonly offers: CouponOfferAdminPort,
    @Inject(COUPON_PROGRAM_ADMIN_ISSUER)
    private readonly adminIssuer: CouponProgramAdminIssuerPort,
  ) {}

  listTemplates() {
    return this.offers.listTemplates();
  }

  getTemplate(couponStableId: string) {
    return this.offers.getTemplate(couponStableId);
  }

  createTemplate(input: CouponTemplateAdminInput) {
    return this.offers.createTemplate(input);
  }

  updateTemplate(couponStableId: string, input: CouponTemplateAdminInput) {
    return this.offers.updateTemplate(couponStableId, input);
  }

  listPrograms() {
    return this.offers.listPrograms();
  }

  getProgram(programStableId: string) {
    return this.offers.getProgram(programStableId);
  }

  createProgram(input: CouponProgramAdminInput) {
    return this.offers.createProgram(input);
  }

  updateProgram(programStableId: string, input: CouponProgramAdminInput) {
    return this.offers.updateProgram(programStableId, input);
  }

  issueProgram(
    programStableId: string,
    input: { userStableId?: string; phone?: string },
  ) {
    return this.adminIssuer.issueAdminPushProgram(programStableId, {
      userStableId: input.userStableId?.trim(),
      normalizedPhone: normalizePhone(input.phone) ?? undefined,
    });
  }
}
