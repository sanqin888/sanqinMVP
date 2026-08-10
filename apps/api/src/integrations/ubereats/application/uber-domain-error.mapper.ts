import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { UberMenuDomainError } from '../domain/menu/uber-menu.errors';
import {
  UberOrderActionNotAllowedError,
  UberOrderDomainError,
} from '../domain/orders/uber-order.errors';

/** HTTP boundary mapping; domain errors deliberately know nothing about Nest. */
export function toUberEatsHttpException(error: unknown): HttpException {
  if (error instanceof UberOrderActionNotAllowedError)
    return new ConflictException({
      code: error.code,
      message: error.message,
      status: error.status,
      action: error.action,
    });
  if (
    error instanceof UberOrderDomainError ||
    error instanceof UberMenuDomainError
  )
    return new BadRequestException({
      code: error.code,
      message: error.message,
    });
  if (error instanceof HttpException) return error;
  throw error;
}
