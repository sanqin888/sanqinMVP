import { Injectable } from '@nestjs/common';
import { UberEatsService } from './ubereats.service';

/** Webhook boundary. Keeps signature verification, inbox claiming and routing behind one narrow API. */
@Injectable()
export class UberWebhookService {
  constructor(private readonly facade: UberEatsService) {}

  handleWebhook(input: Parameters<UberEatsService['handleWebhook']>[0]) {
    return this.facade.handleWebhook(input);
  }
}
