export abstract class UberMenuDomainError extends Error {
  abstract readonly code: string;
}

export class UberMenuScheduleValidationError extends UberMenuDomainError {
  readonly code = 'UBER_MENU_SCHEDULE_INVALID';

  constructor(
    message: string,
    readonly field: 'timezone' | 'businessHours',
  ) {
    super(message);
    this.name = 'UberMenuScheduleValidationError';
  }
}
