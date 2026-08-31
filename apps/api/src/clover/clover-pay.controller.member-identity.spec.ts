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

function createDto(options?: {
  loyaltyRedeemCents?: number;
}): CreatePaymentSessionDto {
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
      ...(options?.loyaltyRedeemCents
        ? { loyaltyRedeemCents: options.loyaltyRedeemCents }
        : {}),
      loyaltyUserStableId: forgedUserStableId,
    },
  };
}

function createHarness() {
  type RecordIntentParams = Parameters<
    CheckoutIntentsService['recordIntent']
  >[0];
  const recordIntent = jest
    .fn<Promise<void>, [RecordIntentParams]>()
    .mockResolvedValue(undefined);
  const checkoutIntents = { recordIntent };
  type QuoteTenderInput = Parameters<OrdersService['quoteWebPaymentTender']>[0];
  const quoteWebPaymentTender = jest
    .fn<
      ReturnType<OrdersService['quoteWebPaymentTender']>,
      [QuoteTenderInput]
    >()
    .mockResolvedValue({
      pricing: {
        subtotalCents: 1000,
        displaySubtotalCents: 1000,
        couponDiscountCents: 0,
        automaticPromotionDiscountCents: 0,
        posManualDiscountCents: 0,
        loyaltyRedeemCents: 0,
        taxCents: 130,
        deliveryFeeCents: 0,
        totalCents: 1130,
        appliedDiscounts: [],
      },
      balanceCents: 0,
      externalCents: 1130,
    });
  const createImmediatePaid = jest.fn<
    ReturnType<OrdersService['createImmediatePaid']>,
    Parameters<OrdersService['createImmediatePaid']>
  >();
  const orders = { quoteWebPaymentTender, createImmediatePaid };
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

    expect(orders.quoteWebPaymentTender).toHaveBeenCalledTimes(1);
    const quotedOrder = orders.quoteWebPaymentTender.mock.calls[0]?.[0];
    expect(quotedOrder?.userStableId).toBeUndefined();
    expect(checkoutIntents.recordIntent).toHaveBeenCalledTimes(1);
    const recordedIntent = checkoutIntents.recordIntent.mock.calls[0]?.[0];
    expect(recordedIntent?.metadata.loyaltyUserStableId).toBeUndefined();
  });

  it('uses the authenticated session member identity for a payment session', async () => {
    const { controller, checkoutIntents, orders } = createHarness();
    const req = {
      user: { userStableId: sessionUserStableId },
    } as AuthedRequest;

    await controller.createPaymentSession(req, createDto());

    expect(orders.quoteWebPaymentTender).toHaveBeenCalledWith(
      expect.objectContaining({ userStableId: sessionUserStableId }),
    );
    expect(checkoutIntents.recordIntent).toHaveBeenCalledTimes(1);
    const recordedIntent = checkoutIntents.recordIntent.mock.calls[0]?.[0];
    expect(recordedIntent?.metadata.loyaltyUserStableId).toBe(
      sessionUserStableId,
    );
  });

  it('completes a zero-external member checkout without creating a Clover payment intent', async () => {
    const { controller, checkoutIntents, orders } = createHarness();
    orders.quoteWebPaymentTender.mockResolvedValue({
      pricing: {
        subtotalCents: 1000,
        displaySubtotalCents: 1000,
        couponDiscountCents: 0,
        automaticPromotionDiscountCents: 0,
        posManualDiscountCents: 0,
        loyaltyRedeemCents: 1000,
        taxCents: 0,
        deliveryFeeCents: 0,
        totalCents: 0,
        appliedDiscounts: [],
      },
      balanceCents: 0,
      externalCents: 0,
    });
    orders.createImmediatePaid.mockResolvedValue({
      orderStableId: 'c4234567890abcdefghijklmn',
    } as never);
    const req = {
      user: { userStableId: sessionUserStableId },
    } as AuthedRequest;

    const response = await controller.createPaymentSession(
      req,
      createDto({ loyaltyRedeemCents: 1000 }),
    );

    expect(orders.createImmediatePaid).toHaveBeenCalledWith(
      expect.objectContaining({
        userStableId: sessionUserStableId,
        paymentMethod: 'STORE_BALANCE',
        redeemValueCents: 1000,
      }),
      'checkout-intent-1',
    );
    expect(checkoutIntents.recordIntent).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      completedOrderStableId: 'c4234567890abcdefghijklmn',
      externalPaymentCents: 0,
    });
  });
});
