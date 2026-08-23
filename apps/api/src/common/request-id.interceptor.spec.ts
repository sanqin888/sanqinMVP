import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestIdInterceptor } from './request-id.interceptor';

describe('RequestIdInterceptor', () => {
  const createContext = (
    method: string,
    url: string,
    statusCode: number,
    originalUrl?: string,
  ) => {
    const request = {
      method,
      url,
      originalUrl,
      headers: {},
    };
    const response = {
      statusCode,
      setHeader: jest.fn(),
    };

    const context = {
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };

    return { context };
  };

  const runIntercept = (
    method: string,
    url: string,
    statusCode: number,
    responseBody: unknown = 'ok',
  ) => {
    const interceptor = new RequestIdInterceptor();
    const { context } = createContext(method, url, statusCode);
    interceptor
      .intercept(context as never, { handle: () => of(responseBody) } as never)
      .subscribe();
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('suppresses successful analytics events logs', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    runIntercept('POST', '/api/v1/analytics/events', 201);

    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('uses debug level for configured GET endpoints', () => {
    const loggerDebugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    runIntercept('GET', '/api/v1/menu/public', 200);

    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/v1/menu/public - 200'),
    );
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('suppresses healthy scheduled-order polling logs', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    runIntercept('GET', '/api/v1/orders/scheduled', 200, { orders: [] });

    expect(loggerLogSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('does not suppress other scheduled-order backend actions', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    runIntercept('POST', '/api/v1/orders/order-1/preparation/start', 200, {
      status: 'making',
    });

    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'POST /api/v1/orders/order-1/preparation/start - 200',
      ),
    );
  });

  it('warns when scheduled-order polling returns an abnormal status', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    runIntercept('GET', '/api/v1/orders/scheduled', 503, { ok: false });

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/v1/orders/scheduled - 503'),
    );
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('suppresses clover quote logs when request duration is at most 200ms', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100)
      .mockReturnValue(1100);

    runIntercept('POST', '/api/v1/clover/pay/online/quote', 201);

    expect(loggerLogSpy).not.toHaveBeenCalled();
  });

  it('logs clover quote when request duration is over 200ms', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1301)
      .mockReturnValue(1301);

    runIntercept('POST', '/api/v1/clover/pay/online/quote', 201);

    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'POST /api/v1/clover/pay/online/quote - 201 (301ms)',
      ),
    );
  });

  it('suppresses print-status logs when the printer state is normal', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    runIntercept('GET', '/api/v1/pos/orders/order-1/print-status', 200, {
      customerStatus: 'COMPLETED',
      kitchenStatus: 'SKIPPED',
    });

    expect(loggerLogSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('warns when print-status reports a failed printer state', () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    runIntercept(
      'GET',
      '/api/v1/pos/orders/order-1/print-status?source=board',
      200,
      { customerStatus: 'FAILED', kitchenStatus: 'COMPLETED' },
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'GET /api/v1/pos/orders/order-1/print-status?source=board - 200',
      ),
    );
    expect(loggerLogSpy).not.toHaveBeenCalled();
  });
});
