jest.mock('@prisma/client', () => ({
  ...jest.requireActual<typeof import('@prisma/client')>('@prisma/client'),
  OrderStatus: { PENDING: 'PENDING' },
  UberOpsTicketType: { GENERAL: 'GENERAL' },
  UberOpsTicketPriority: { NORMAL: 'NORMAL' },
  UberOpsTicketStatus: { OPEN: 'OPEN' },
}));
jest.mock('../../auth/session-auth.guard', () => ({
  SESSION_COOKIE_NAME: 'session_id',
  SessionAuthGuard: class SessionAuthGuard {},
}));
jest.mock('../../auth/admin-mfa.guard', () => ({
  AdminMfaGuard: class AdminMfaGuard {},
}));
jest.mock('../../auth/roles.guard', () => ({
  RolesGuard: class RolesGuard {},
}));
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { AppLogger } from '../../common/app-logger';
import { UberEatsController } from './ubereats.controller';

type ControllerMethod = keyof UberEatsController;

function guardsFor(method: ControllerMethod): unknown[] {
  return (
    (Reflect.getMetadata(
      GUARDS_METADATA,
      UberEatsController.prototype[method],
    ) as unknown[] | undefined) ?? []
  );
}

function rolesFor(method: ControllerMethod): string[] {
  return (
    (Reflect.getMetadata(ROLES_KEY, UberEatsController.prototype[method]) as
      | string[]
      | undefined) ?? []
  );
}

describe('UberEatsController 权限边界', () => {
  const protectedRoutes: ControllerMethod[] = [
    'oauthStart',
    'oauthStores',
    'oauthProvision',
    'listPendingOrders',
    'listItemChannelConfigs',
    'generateReconciliationReport',
    'listOpsTickets',
  ];

  it.each(protectedRoutes)(
    '%s 要求管理员会话并拒绝普通用户和 POS 设备角色',
    (method) => {
      expect(guardsFor(method)).toEqual(
        expect.arrayContaining([SessionAuthGuard, RolesGuard]),
      );
      expect(rolesFor(method)).toEqual(['ADMIN']);
    },
  );

  it.each<ControllerMethod>([
    'syncOrderStatus',
    'syncStoreStatus',
    'publishMenu',
  ])('%s 的破坏性动作要求管理员 MFA', (method) => {
    expect(guardsFor(method)).toEqual([
      SessionAuthGuard,
      AdminMfaGuard,
      RolesGuard,
    ]);
    expect(rolesFor(method)).toEqual(['ADMIN']);
  });

  it('仅 OAuth callback 和 POST webhook 不设置会话权限', () => {
    expect(guardsFor('oauthCallback')).toEqual([]);
    expect(guardsFor('webhook')).toEqual([]);
    expect(guardsFor('health')).toEqual(
      expect.arrayContaining([SessionAuthGuard, RolesGuard]),
    );
    expect(guardsFor('head')).toEqual(
      expect.arrayContaining([SessionAuthGuard, RolesGuard]),
    );
  });
});

describe('UberEatsController OAuth callback', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    jest.restoreAllMocks();
  });

  it('callback 使用签名 cookie 将 state 绑定回 OAuth start 的管理员会话', async () => {
    const service = {
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({
        merchantUberUserId: 'merchant_1',
        scope: 'eats.store',
        expiresAt: null,
      }),
    };
    const controller = new UberEatsController(service as never);

    await controller.oauthCallback(
      { signedCookies: { session_id: 'admin_session_1' } } as never,
      'authorization_code',
      'signed_state',
    );

    expect(service.exchangeAuthorizationCode).toHaveBeenCalledWith(
      'authorization_code',
      'signed_state',
      'admin_session_1',
    );
  });

  it('callback 日志只记录 correlation ID 和必要参数是否存在', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const service = {
      exchangeAuthorizationCode: jest
        .fn()
        .mockRejectedValue(new Error('authorization code=super-secret')),
    };
    const controller = new UberEatsController(service as never);

    await controller.oauthCallback(
      {
        session: { sessionId: 'session-secret' },
        query: {
          code: 'super-secret',
          state: 'state-secret',
          extra: 'private',
        },
      } as never,
      'super-secret',
      'state-secret',
    );

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
      request,
      'code',
      'state',
    );
    expect(developmentHtml).toContain(
      '&lt;script&gt;alert(&quot;token&quot;)&lt;/script&gt;',
    );
    expect(developmentHtml).not.toContain('<script>');

    process.env.NODE_ENV = 'production';
    const productionHtml = await controller.oauthCallback(
      request,
      'code',
      'state',
    );
    expect(productionHtml).toContain('授权处理失败，请重试或联系管理员。');
    expect(productionHtml).not.toContain('script');
    expect(productionHtml).not.toContain('token');
  });

  it('webhook 日志仅包含安全元数据，不包含认证 headers', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const service = { handleWebhook: jest.fn().mockResolvedValue(undefined) };
    const controller = new UberEatsController(service as never);
    const rawBody = Buffer.from(
      '{"event_type":"orders.notification","data":{"id":"1"}}',
      'utf8',
    );

    await controller.webhook({
      body: rawBody,
      headers: {
        'x-request-id': 'request-safe-1',
        'content-type': 'application/json',
        'x-uber-signature': 'signature-must-not-be-logged',
        cookie: 'session=must-not-be-logged',
        authorization: 'Bearer must-not-be-logged',
        'proxy-authorization': 'Basic must-not-be-logged',
      },
    } as never);

    const logs = logSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('requestId=request-safe-1');
    expect(logs).toContain('eventType=orders.notification');
    expect(logs).toContain('contentType=application/json');
    expect(logs).toContain(`bodyBytes=${rawBody.length}`);
    expect(logs).not.toContain('signature-must-not-be-logged');
    expect(logs).not.toContain('session=must-not-be-logged');
    expect(logs).not.toContain('Bearer must-not-be-logged');
    expect(logs).not.toContain('Basic must-not-be-logged');
  });

  it('将带空格和原始排版的 JSON 字节原样用于验签和解析', async () => {
    const secret = 'static-webhook-secret';
    const rawBody = Buffer.from(
      '{\n  "data": { "status": "SUCCEEDED" },\n  "event_type": "menus.notification"\n}',
      'utf8',
    );
    const signature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const handleWebhook = jest.fn(
      ({
        headers,
        rawBody: received,
      }: {
        headers: Record<string, string>;
        rawBody: Buffer;
      }) => {
        const expected = createHmac('sha256', secret)
          .update(received)
          .digest('hex');
        if (headers['x-uber-signature'] !== expected) {
          throw new UnauthorizedException();
        }
      },
    );
    const controller = new UberEatsController({ handleWebhook } as never);

    await expect(
      controller.webhook({
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-uber-signature': signature,
        },
      } as never),
    ).resolves.toEqual({ ok: true });
    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody }),
    );

    const modifiedBody = Buffer.from(rawBody);
    modifiedBody[5] = modifiedBody[5] === 0x20 ? 0x09 : 0x20;
    await expect(
      controller.webhook({
        body: modifiedBody,
        headers: {
          'content-type': 'application/json',
          'x-uber-signature': signature,
        },
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('拒绝已被 JSON parser 消费、无法取得原始字节的请求', async () => {
    const controller = new UberEatsController({
      handleWebhook: jest.fn(),
    } as never);

    await expect(
      controller.webhook({
        body: { event_type: 'menus.notification' },
        headers: {},
      } as never),
    ).rejects.toThrow('Uber webhook raw body 不可用');
  });
});
