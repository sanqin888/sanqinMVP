import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  POS_PRINT_JOB_DISPATCH_REQUESTED,
  type PosPrintJobDispatchRequest,
} from '../orders/public-api';
import { PosGateway } from './pos.gateway';

@Injectable()
export class PosPrintDispatchListener {
  constructor(private readonly posGateway: PosGateway) {}

  @OnEvent(POS_PRINT_JOB_DISPATCH_REQUESTED, { suppressErrors: false })
  dispatch(request: PosPrintJobDispatchRequest) {
    return this.posGateway.sendPrintJob(request);
  }
}
