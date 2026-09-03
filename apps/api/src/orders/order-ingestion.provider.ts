import type { Provider } from '@nestjs/common';
import { ORDER_INGESTION } from './order-ingestion.contract';
import { OrderIngestionService } from './order-ingestion.service';

/** Public Nest composition provider for the Orders ingestion port. */
export const ORDER_INGESTION_PROVIDER: Provider = {
  provide: ORDER_INGESTION,
  useClass: OrderIngestionService,
};
