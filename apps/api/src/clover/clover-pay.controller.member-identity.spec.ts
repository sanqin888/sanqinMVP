import type { Request } from 'express';
import { CloverPayController } from './clover-pay.controller';
import type { CloverService } from './clover.service';
import type { CheckoutIntentsService } from './checkout-intents.service';
import type { OrdersService } from '../orders/orders.service';
import type { PricingTokenService } from './pricing-token.service';
import type { EmailService } from '../email/email.service';
import type { EmailVerificationService } from '../email/email-verification.service';
import type { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import type { CreatePaymentSessionDto } from './dto/create-payment-session.dto';

type AuthedRequest = Request & {
  user?: { userStableId?: string };
};

const productStableId = 'c1234567890abcdefghijklmn';
const forgedUserStableId = 'c2234567890abcdefghijklmn';
const sessionUserStableId = 'c3234567890abcdefghijklmn';

function createDto(): CreatePaymentSessionDto {
  return {
    paymentMethod: 'CARD',
    checkoutIntentId: 'checkout-intent-1',
    metadata: {
      locale: 'en',
      fulfillment: 'pickup',
      customer: {
        firstName: 'San',
        lastName: 'Qin',
        email: 'guest@example.com',
      },
      items: [
        {
          productStableId,
          priceCents: 1000,
          quantity: 1,
        },
      ],
      subtotalCents: 1000,
      taxCents: 130,
      loyaltyUserStableId: forgedUserStableId,
    },
  };
}

function createHarness() {
  const checkoutIntents = {
    recordIntent: jest.fn().mockResolvedValue(undefined),
  };
  const orders = {
    quoteOrderPricing: jest.fn().mockResolvedValue({ totalCents: 1130 }),
  };
  const pricingTokens = {
    issue: jest.fn().mockReturnValue({
      pricingToken: 'pricing-token',
      expiresAt: '2026-08-27T20:00:00.000Z',
    }),
  };
  const controller = new CloverPayController(
    {} as CloverService,
    checkoutIntents as unknown as CheckoutIntentsService,
    orders as unknown as OrdersService,
    pricingTokens as unknown as PricingTokenService,
    {} as EmailService,
    {} as EmailVerificationService,
    {} as PhoneVerificationService,
  );

  return { controller, checkoutIntents, orders };
}

describe('CloverPayController member identity boundary', () => {
  it('clears a client-supplied member identity for a guest payment session', async () => {
    const { controller, checkoutIntents, orders } = createHarness();

    await controller.createPaymentSession({} as AuthedRequest, createDto());

    expect(orders.quoteOrderPricing).toHaveBeenCalledWith(
      expect.objectContaining({ userStableId: undefined }),
    );
    expect(checkoutIntents.recordIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ loyaltyUserStableId: undefined }),
      }),
    );
  });

  it('uses the authenticated session member identity for a payment session', async () => {
    const { controller, checkoutIntents, orders } = createHarness();
    const req = {
      user: { userStableId: sessionUserStableId },
    } as AuthedRequest;

    await controller.createPaymentSession(req, createDto());

    expect(orders.quoteOrderPricing).toHaveBeenCalledWith(
      expect.objectContaining({ userStableId: sessionUserStableId }),
    );
    expect(checkoutIntents.recordIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          loyaltyUserStableId: sessionUserStableId,
        }),
      }),
    );
  });
});
