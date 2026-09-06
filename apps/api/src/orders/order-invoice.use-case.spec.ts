import type { OrderInvoiceDeliveryPort } from '../notifications/public-api';
import type { OrderPrintPayloadReaderPort } from './order-print-payload.contract';
import { OrderInvoiceUseCase } from './order-invoice.use-case';

const createPrintPayload = () => ({
  locale: 'en' as const,
  orderNumber: 'WEB-INV-1',
  customerName: 'Invoice Customer',
  pickupCode: 'A101',
  fulfillment: 'pickup' as const,
  paymentMethod: 'card' as const,
  orderNotes: null,
  utensils: null,
  snapshot: {
    items: [],
    subtotalCents: 1000,
    displaySubtotalCents: 1000,
    appliedDiscounts: [],
    loyaltyRedeemCents: 0,
    taxCents: 130,
    orderTotalCents: 1130,
    balancePaidCents: 0,
    externalPaidCents: 1130,
    totalCents: 1130,
    creditCardSurchargeCents: 0,
    discountCents: 0,
    deliveryFeeCents: 0,
    deliveryCostCents: 0,
    deliverySubsidyCents: 0,
  },
});

describe('OrderInvoiceUseCase', () => {
  it('delivers the Orders-owned print snapshot through the invoice delivery port', async () => {
    const printPayloadReader = {
      getByStableId: jest.fn().mockResolvedValue(createPrintPayload()),
    };
    const orderInvoiceDelivery = {
      sendOrderInvoice: jest.fn().mockResolvedValue({
        ok: true,
        sendId: 'invoice-1',
      }),
    };
    const useCase = new OrderInvoiceUseCase(
      printPayloadReader as OrderPrintPayloadReaderPort,
      orderInvoiceDelivery as OrderInvoiceDeliveryPort,
    );

    await expect(
      useCase.sendInvoiceEmail({
        orderStableId: 'cordinvoice001',
        email: ' Invoice@example.com ',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });

    expect(printPayloadReader.getByStableId).toHaveBeenCalledWith(
      'cordinvoice001',
      'en',
    );
    expect(orderInvoiceDelivery.sendOrderInvoice).toHaveBeenCalledTimes(1);
    const [invoiceInput] =
      orderInvoiceDelivery.sendOrderInvoice.mock.calls[0] as [
        Parameters<OrderInvoiceDeliveryPort['sendOrderInvoice']>[0],
      ];
    expect(invoiceInput).toMatchObject({
      to: 'invoice@example.com',
      locale: 'en',
      payload: {
        locale: 'en',
        orderNumber: 'WEB-INV-1',
        fulfillment: 'pickup',
        paymentMethod: 'card',
      },
    });
  });

  it('rejects an invalid email before reading the print payload', async () => {
    const printPayloadReader = { getByStableId: jest.fn() };
    const orderInvoiceDelivery = { sendOrderInvoice: jest.fn() };
    const useCase = new OrderInvoiceUseCase(
      printPayloadReader as OrderPrintPayloadReaderPort,
      orderInvoiceDelivery as OrderInvoiceDeliveryPort,
    );

    await expect(
      useCase.sendInvoiceEmail({
        orderStableId: 'cordinvoice001',
        email: 'not-an-email',
      }),
    ).rejects.toThrow('invalid_email');

    expect(printPayloadReader.getByStableId).not.toHaveBeenCalled();
    expect(orderInvoiceDelivery.sendOrderInvoice).not.toHaveBeenCalled();
  });
});
