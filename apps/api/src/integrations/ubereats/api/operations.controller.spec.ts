import { PATH_METADATA } from '@nestjs/common/constants';
import {
  UberBusinessConflictError,
  UberTransientUpstreamError,
  UberValidationError,
} from '../application/errors/uber-application.error';
import { UberEatsOperationsController } from './operations.controller';

describe('UberEatsOperationsController contract', () => {
  const generateReport = { execute: jest.fn() };
  const createTicket = { execute: jest.fn() };
  const retryTicket = { execute: jest.fn() };
  const queries = {};

  const controller = () =>
    new UberEatsOperationsController(
      generateReport as never,
      createTicket as never,
      retryTicket as never,
      queries as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('exposes exactly one final route for report generation and ticket retry', () => {
    const routes = Object.getOwnPropertyNames(
      UberEatsOperationsController.prototype,
    )
      .map((name): unknown =>
        Reflect.getMetadata(
          PATH_METADATA,
          UberEatsOperationsController.prototype[name as never],
        ),
      )
      .filter((path): path is string => typeof path === 'string');

    expect(
      routes.filter((path) => path.endsWith('reports/reconciliation/generate')),
    ).toEqual(['v2/reports/reconciliation/generate']);
    expect(
      routes.filter((path) =>
        path.endsWith('ops/tickets/:ticketStableId/retry'),
      ),
    ).toEqual(['v2/ops/tickets/:ticketStableId/retry']);
  });

  it('presents persisted report and ticket identifiers', async () => {
    generateReport.execute.mockResolvedValue({ reportStableId: 'report-42' });
    retryTicket.execute.mockResolvedValue({ ticketStableId: 'ticket-42' });

    await expect(
      controller().generateReconciliationReportV2({} as never),
    ).resolves.toMatchObject({
      operationId: 'report-42',
      status: 'SUCCEEDED',
    });
    await expect(
      controller().retryOpsTicketV2('ticket-42'),
    ).resolves.toMatchObject({ operationId: 'ticket-42', status: 'SUCCEEDED' });
  });

  it.each([
    new UberValidationError({
      code: 'UBER_INPUT_INVALID',
      message: 'invalid',
      operation: 'operations.generate',
    }),
    new UberBusinessConflictError({
      code: 'UBER_TICKET_CONFLICT',
      message: 'conflict',
      operation: 'operations.retry',
    }),
    new UberTransientUpstreamError({
      code: 'UBER_HTTP_503',
      message: 'retry later',
      operation: 'operations.retry',
    }),
  ])(
    'passes %s to the exception boundary without collapsing it',
    async (error) => {
      retryTicket.execute.mockRejectedValue(error);

      await expect(controller().retryOpsTicketV2('ticket-42')).rejects.toBe(
        error,
      );
      expect(error.code).not.toBe('UBER_OPERATION_FAILED');
    },
  );
});
