export abstract class UberOrderDomainError extends Error {
  abstract readonly code: string;
}

export class UberOrderActionNotAllowedError extends UberOrderDomainError {
  readonly code = 'UBER_ORDER_ACTION_NOT_ALLOWED';

  constructor(
    readonly status: string,
    readonly action: string,
  ) {
    super(`Uber order action ${action} is not allowed from status ${status}`);
    this.name = 'UberOrderActionNotAllowedError';
  }
}

export class UberOrderValidationError extends UberOrderDomainError {
  readonly code = 'UBER_ORDER_VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'UberOrderValidationError';
  }
}
