import { UberMenuDomainError } from '../domain/menu/uber-menu.errors';
import {
  UberOrderActionNotAllowedError,
  UberOrderDomainError,
} from '../domain/orders/uber-order.errors';
import {
  UberApplicationError,
  UberBusinessConflictError,
  UberValidationError,
} from './errors/uber-application.error';

/** Converts domain failures to the framework-free application error contract. */
export function toUberEatsApplicationError(
  error: unknown,
): UberApplicationError {
  if (error instanceof UberApplicationError) return error;
  if (error instanceof UberOrderActionNotAllowedError) {
    return new UberBusinessConflictError({
      code: error.code,
      message: error.message,
      operation: 'order.transition',
      cause: error,
    });
  }
  if (
    error instanceof UberOrderDomainError ||
    error instanceof UberMenuDomainError
  ) {
    return new UberValidationError({
      code: error.code,
      message: error.message,
      operation:
        error instanceof UberOrderDomainError
          ? 'order.validate'
          : 'menu.validate',
      cause: error,
    });
  }
  return new UberApplicationError(
    'non-retryable-upstream',
    'UBER_OPERATION_FAILED',
    'Uber operation failed',
    'uber.operation',
    false,
    { cause: error },
  );
}
