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
  // 显式指定 Logger 类型
  private readonly logger: Logger = new Logger(PosDeviceGuard.name);

  constructor(private readonly posDeviceService: PosDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. 定义获取 Cookie 值的辅助函数
    const getCookieValue = (key: string): string | undefined => {
      // 📌 修复 ESLint Error: 对 req.signedCookies 进行显式类型断言
      const signedCookies = req.signedCookies as
        | Record<string, string>
        | undefined;
      if (signedCookies && signedCookies[key]) {
        return signedCookies[key];
      }

      // 📌 修复 ESLint Error: 对 req.cookies 进行显式类型断言
      const cookies = req.cookies as Record<string, string> | undefined;
      if (cookies && cookies[key]) {
        return cookies[key];
      }

      // 🛡️ 兜底：手动从 Header 解析
      if (req.headers['cookie']) {
        const rawCookie = req.headers['cookie'];
        const match = rawCookie
          .split(';')
          .find((pair) => pair.trim().startsWith(`${key}=`));
        if (match) {
          let value = match.trim().split('=')[1];
          if (value) {
            value = decodeURIComponent(value);
            // 如果手动解析到了 's:' 开头的签名字符串，尝试提取原始值
            if (value.startsWith('s:')) {
              // 去掉 's:' 前缀，取第一个点之前的部分
              const unsignedValue = value.substring(2).split('.')[0];
              return unsignedValue;
            }
            return value;
          }
        }
      }
      return undefined;
    };

    // 2. 获取 ID 和 Key
    const deviceStableId = getCookieValue(POS_DEVICE_ID_COOKIE);
    const deviceKey = getCookieValue(POS_DEVICE_KEY_COOKIE);

    // 🔍 调试日志
    if (!deviceStableId || !deviceKey) {
      this.logger.warn(
        `⚠️ Credentials missing. StableID: ${deviceStableId}, Key present: ${!!deviceKey}`,
      );
      this.logger.debug(`Original Headers: ${req.headers['cookie']}`);
      throw new UnauthorizedException('Missing POS device credentials');
    }

    // 3. 验证设备
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
