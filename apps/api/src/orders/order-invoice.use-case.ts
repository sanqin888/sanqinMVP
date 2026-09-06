import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { normalizeOrderEmail } from './order-contact-normalization';
import {
  ORDER_INVOICE_DELIVERY,
  type OrderInvoiceDeliveryPort,
  type OrderInvoicePayload,
} from '../notifications/public-api';
import {
  ORDER_PRINT_PAYLOAD_READER,
  type OrderPrintPayloadReaderPort,
  type PrintPosPayloadDto,
} from './order-print-payload.contract';

@Injectable()
export class OrderInvoiceUseCase {
  constructor(
    @Inject(ORDER_PRINT_PAYLOAD_READER)
    private readonly printPayloadReader: OrderPrintPayloadReaderPort,
    @Inject(ORDER_INVOICE_DELIVERY)
    private readonly orderInvoiceDelivery: OrderInvoiceDeliveryPort,
  ) {}

  async sendInvoiceEmail(params: {
    orderStableId: string;
    email?: string | null;
    locale?: string;
  }): Promise<{ ok: boolean }> {
    const normalizedEmail = normalizeOrderEmail(params.email);
    if (!normalizedEmail) {
      throw new BadRequestException('invalid_email');
    }

    const payload = await this.printPayloadReader.getByStableId(
      params.orderStableId,
      params.locale,
    );
    const invoicePayload: OrderInvoicePayload = {
      ...payload,
      fulfillment: this.toInvoiceFulfillment(payload.fulfillment),
    };
    await this.orderInvoiceDelivery.sendOrderInvoice({
      to: normalizedEmail,
      payload: invoicePayload,
      locale: params.locale,
    });

    return { ok: true };
  }

  private toInvoiceFulfillment(
    fulfillment: PrintPosPayloadDto['fulfillment'],
  ): OrderInvoicePayload['fulfillment'] {
    switch (fulfillment) {
      case 'pickup':
        return 'pickup';
      case 'dine_in':
        return 'dine_in';
      case 'delivery':
        return 'delivery';
      default:
        throw new BadRequestException('unsupported_fulfillment_type');
    }
  }
}
