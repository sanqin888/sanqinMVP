import { UberMenuScheduleValidationError } from '../../domain/menu/uber-menu.errors';
import { UberOrderActionNotAllowedError } from '../../domain/orders/uber-order.errors';
import {
  UberBusinessConflictError,
  UberValidationError,
} from './uber-application.error';
import { toUberEatsApplicationError } from './uber-domain-error.mapper';

describe('toUberEatsApplicationError', () => {
  it('maps illegal order transitions to conflict responses', () => {
    expect(
      toUberEatsApplicationError(
        new UberOrderActionNotAllowedError('pending', 'READY_FOR_PICKUP'),
      ),
    ).toBeInstanceOf(UberBusinessConflictError);
  });

  it('maps validation failures to bad requests', () => {
    expect(
      toUberEatsApplicationError(
        new UberMenuScheduleValidationError('invalid timezone', 'timezone'),
      ),
    ).toBeInstanceOf(UberValidationError);
  });
});
