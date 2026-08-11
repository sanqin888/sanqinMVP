import { Logger } from '@nestjs/common';
import { AppLogger } from '../src/common/app-logger';

const loggerMethods = ['log', 'warn', 'error', 'debug', 'verbose'] as const;

beforeEach(() => {
  for (const method of loggerMethods) {
    jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, method).mockImplementation(function (
      message,
      ...optionalParams
    ) {
      Logger.prototype[method].call(this, message, ...optionalParams);
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});
