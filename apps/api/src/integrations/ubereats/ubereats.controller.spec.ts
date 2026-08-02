jest.mock('@prisma/client', () => ({
  ...jest.requireActual<typeof import('@prisma/client')>('@prisma/client'),
  OrderStatus: { PENDING: 'PENDING' },
  UberOpsTicketType: { GENERAL: 'GENERAL' },
  UberOpsTicketPriority: { NORMAL: 'NORMAL' },
  UberOpsTicketStatus: { OPEN: 'OPEN' },
}));
jest.mock('../../auth/session-auth.guard', () => ({
  SessionAuthGuard: class SessionAuthGuard {},
}));
jest.mock('../../auth/roles.guard', () => ({
  RolesGuard: class RolesGuard {},
}));

import { AppLogger } from '../../common/app-logger';
import { UberEatsController } from './ubereats.controller';

describe('UberEatsController OAuth callback', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    jest.restoreAllMocks();
  });

  it('callback 日志只记录 correlation ID 和必要参数是否存在', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const service = {
      exchangeAuthorizationCode: jest
        .fn()
        .mockRejectedValue(new Error('authorization code=super-secret')),
    };
    const controller = new UberEatsController(service as never);

    await controller.oauthCallback('super-secret', 'state-secret', {
      session: { sessionId: 'session-secret' },
      query: { code: 'super-secret', state: 'state-secret', extra: 'private' },
    } as never);

    const logs = logSpy.mock.calls.flat().join(' ');
    expect(logs).toMatch(/correlationId=[0-9a-f-]+/);
    expect(logs).toContain('hasCode=true hasState=true');
    expect(logs).not.toContain('super-secret');
    expect(logs).not.toContain('state-secret');
    expect(logs).not.toContain('private');
  });

  it('转义开发环境动态错误，并在生产环境隐藏错误细节', async () => {
    const service = {
      exchangeAuthorizationCode: jest
        .fn()
        .mockRejectedValue(new Error('<script>alert("token")</script>')),
    };
    const controller = new UberEatsController(service as never);
    const request = { session: { sessionId: 'session_1' } } as never;

    const developmentHtml = await controller.oauthCallback(
      'code',
      'state',
      request,
    );
    expect(developmentHtml).toContain(
      '&lt;script&gt;alert(&quot;token&quot;)&lt;/script&gt;',
    );
    expect(developmentHtml).not.toContain('<script>');

    process.env.NODE_ENV = 'production';
    const productionHtml = await controller.oauthCallback(
      'code',
      'state',
      request,
    );
    expect(productionHtml).toContain('授权处理失败，请重试或联系管理员。');
    expect(productionHtml).not.toContain('script');
    expect(productionHtml).not.toContain('token');
  });
});
