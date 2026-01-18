// apps/api/src/pos/pos-device.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { PosDeviceService } from './pos-device.service';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from './pos-device.constants';

@Injectable()
export class PosDeviceGuard implements CanActivate {
  // ✅ 修复 ESLint 错误：显式指定 Logger 类型，防止被推断为 any 导致 unsafe 报错
  private readonly logger: Logger = new Logger(PosDeviceGuard.name);

  constructor(private readonly posDeviceService: PosDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. 标准获取方式
    let cookies = req.cookies as Partial<Record<string, string>> | undefined;

    // 🔍 调试日志：如果拿不到，打印原始 Header
    // 注意：这里使用 req.headers['cookie'] 避免属性访问的潜在 lint 问题
    if (!cookies?.[POS_DEVICE_ID_COOKIE]) {
      const rawCookie = req.headers['cookie'];
      this.logger.warn(
        `⚠️ Cookie missing in req.cookies. Headers[cookie]: ${rawCookie}`,
      );
    }

    // 2. 🛡️ 兜底策略：如果 cookie-parser 没解出来，但 Header 里有，我们手动解
    if (
      (!cookies?.[POS_DEVICE_ID_COOKIE] || !cookies?.[POS_DEVICE_KEY_COOKIE]) &&
      req.headers['cookie']
    ) {
      this.logger.log('🔧 Attempting manual cookie parsing fallback...');
      const manualCookies: Record<string, string> = {};
      const rawCookie = req.headers['cookie']; // 强制断言为 string

      rawCookie.split(';').forEach((pair) => {
        const parts = pair.trim().split('=');
        // 确保分割正确，key 不为空
        if (parts.length >= 2) {
          const key = parts[0];
          // 重新组合 value (防止 value 中包含 =)
          const value = parts.slice(1).join('=');
          manualCookies[key] = decodeURIComponent(value);
        }
      });
      // 合并到 cookies 对象中
      cookies = { ...cookies, ...manualCookies };
    }

    const deviceStableId = cookies?.[POS_DEVICE_ID_COOKIE];
    const deviceKey = cookies?.[POS_DEVICE_KEY_COOKIE];

    if (typeof deviceStableId !== 'string' || typeof deviceKey !== 'string') {
      this.logger.error('❌ Still missing credentials after fallback.');
      throw new UnauthorizedException('Missing POS device credentials');
    }

    const device = await this.posDeviceService.verifyDevice({
      deviceStableId,
      deviceKey,
    });

    if (!device) {
      this.logger.warn(
        `⛔ Device verification failed for ID: ${deviceStableId}`,
      );
      throw new UnauthorizedException('Invalid POS device credentials');
    }

    (req as Request & { posDevice?: typeof device }).posDevice = device;
    return true;
  }
}
