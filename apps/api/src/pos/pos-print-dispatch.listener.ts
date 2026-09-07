import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ORDER_PRINT_HANDOFF_REQUESTED,
  type OrderPrintHandoffRequest,
} from '../orders/public-api';
import { PosGateway } from './pos.gateway';

@Injectable()
export class PosPrintDispatchListener {
  constructor(private readonly posGateway: PosGateway) {}

  @OnEvent(ORDER_PRINT_HANDOFF_REQUESTED, { suppressErrors: false })
  dispatch(request: OrderPrintHandoffRequest) {
    return this.posGateway.enqueuePrintHandoff(request);
  }
}
