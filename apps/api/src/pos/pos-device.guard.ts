// apps/api/src/pos/pos-device.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPosIdentity } from './pos-device-auth.contract';
import { PosDeviceService } from './pos-device.service';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from './pos-device.constants';

@Injectable()
export class PosDeviceGuard implements CanActivate {
  private readonly logger = new Logger(PosDeviceGuard.name);

  constructor(private readonly posDeviceService: PosDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 1. 定义获取 Cookie 值的辅助函数
    const getCookieValue = (key: string): string | undefined => {
      // 优先检查签名 Cookie (修复点：显式类型断言)
      const signedCookies = req.signedCookies as
        | Record<string, string>
        | undefined;
      if (signedCookies && signedCookies[key]) {
        return signedCookies[key];
      }

      // 检查普通 Cookie (修复点：显式类型断言)
      const cookies = req.cookies as Record<string, string> | undefined;
      if (cookies && cookies[key]) {
        return cookies[key];
      }

      // 🛡️ 兜底：手动从 Header 解析 (保留此逻辑以应对特殊网络环境)
      if (req.headers['cookie']) {
        const rawCookie = req.headers['cookie'];
        const match = rawCookie
          .split(';')
          .find((pair) => pair.trim().startsWith(`${key}=`));
        if (match) {
          let value = match.trim().split('=')[1];
          if (value) {
            value = decodeURIComponent(value);
            // 如果解析出带 's:' 前缀的签名值，手动提取原始内容
            if (value.startsWith('s:')) {
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

    if (!deviceStableId || !deviceKey) {
      // 移除了详细的 Header 打印，只保留标准报错
      throw new UnauthorizedException('Missing POS device credentials');
    }

    // 3. 验证设备
    const device = await this.posDeviceService.verifyCredentials({
      deviceStableId,
      deviceKey,
    });

    if (!device) {
      // 这个 Warning 可以保留，属于业务异常，有助于排查非法设备访问
      this.logger.warn(
        `⛔ Device verification failed for ID: ${deviceStableId}`,
      );
      throw new UnauthorizedException('Invalid POS device credentials');
    }

    (req as Request & { posDevice?: AuthenticatedPosIdentity }).posDevice =
      device;
    return true;
  }
}
