import { BadRequestException, ConflictException } from '@nestjs/common';
import { UberMenuScheduleValidationError } from '../domain/menu/uber-menu.errors';
import { UberOrderActionNotAllowedError } from '../domain/orders/uber-order.errors';
import { toUberEatsHttpException } from './uber-domain-error.mapper';

describe('toUberEatsHttpException', () => {
  it('maps illegal order transitions to conflict responses', () => {
    expect(
      toUberEatsHttpException(
        new UberOrderActionNotAllowedError('pending', 'READY_FOR_PICKUP'),
      ),
    ).toBeInstanceOf(ConflictException);
  });

  it('maps validation failures to bad requests', () => {
    expect(
      toUberEatsHttpException(
        new UberMenuScheduleValidationError('invalid timezone', 'timezone'),
      ),
    ).toBeInstanceOf(BadRequestException);
  });
});
