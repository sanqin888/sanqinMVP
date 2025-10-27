// apps/api/src/clover/clover.service.ts
import { Injectable, Logger } from '@nestjs/common';

type SimResult = 'SUCCESS' | 'FAILURE';

@Injectable()
export class CloverService {
  private readonly logger = new Logger(CloverService.name);

  // —— 对外入口 —— 仅在 Clover 成功时置 paid
  public async simulateByChargeAndMarkIfSuccess(orderId: string, result: SimResult) {
    if (!orderId) return { ok: false, reason: 'Missing orderId' };
    if (result !== 'SUCCESS') return { ok: false, markedPaid: false, reason: 'Simulated FAILURE' };

    // 快速校验密钥，缺哪个就立即返回，不要“无反应”
    const tokenizeKey = this.getTokenizeKey();
    if (!tokenizeKey) {
      return { ok: false, reason: '缺少 token-sandbox apikey（CLOVER_TOKENIZE_APIKEY 或 CLOVER_ECOMM_KEY）' };
    }
    const chargeBearer = this.getChargeBearer();
    if (!chargeBearer) {
      return { ok: false, reason: '缺少 scl-sandbox Bearer（CLOVER_CHARGE_BEARER 或 CLOVER_ECOMM_KEY）' };
    }

    // 读取订单金额（¢）
    const order = await this.getOrderFromInternal(orderId);
    if (!order) return { ok: false, reason: 'Order not found' };
    const amountCents = Number(order.totalCents ?? 0);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return { ok: false, reason: 'Invalid order totalCents' };
    }
    const currency = (process.env.CLOVER_CURRENCY || 'USD').toUpperCase();

    // 1) token-sandbox：生成卡 token（source）
    const sourceToken = await this.createSandboxCardToken(tokenizeKey);
    if (!sourceToken) {
      return { ok: false, markedPaid: false, reason: 'Tokenize failed（检查 CLOVER_TOKENIZE_APIKEY / CLOVER_ECOMM_KEY / 测试卡配置）' };
    }

    // 2) scl-sandbox：创建 charge
    const charge = await this.createCharge(amountCents, currency, sourceToken, chargeBearer);

    // 3) 仅明确成功才置 paid
    const success = this.isChargeSuccess(charge);
    if (success) {
      await this.markOrderPaidViaHttp(orderId);
      return { ok: true, markedPaid: true, charge };
    }
    return { ok: false, markedPaid: false, charge };
  }

  // —— 兼容旧控制器的调用名，不改控制器也能用
  public async simulateOnlinePayment(payload: { orderId: string; result?: 'SUCCESS' | 'FAILURE' }) {
    const { orderId, result = 'SUCCESS' } = payload ?? {};
    return this.simulateByChargeAndMarkIfSuccess(orderId, result);
  }

  // ===== 内部工具 =====

  private getTokenizeKey(): string | null {
    return (
      process.env.CLOVER_TOKENIZE_APIKEY ||
      process.env.CLOVER_ECOMM_PUBLIC_KEY ||
      process.env.CLOVER_ECOMM_KEY || // 只有一把钥匙时先用它试 apikey
      null
    );
  }

  private getChargeBearer(): string | null {
    return (
      process.env.CLOVER_CHARGE_BEARER ||
      process.env.CLOVER_ECOMM_PRIVATE_KEY ||
      process.env.CLOVER_ECOMM_KEY || // 只有一把钥匙时也试作 Bearer
      null
    );
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  }

  private async getOrderFromInternal(orderId: string) {
    const base = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 4000}/api`;
    // 优先 /orders/:id；若没有该接口，回退到 /orders/recent 查找
    try {
      const byId = await this.fetchWithTimeout(`${base}/orders/${orderId}`, { headers: { Accept: 'application/json' } }, 8000);
      if (byId.ok) return await byId.json();
    } catch {}
    try {
      const recent = await this.fetchWithTimeout(`${base}/orders/recent`, { headers: { Accept: 'application/json' } }, 8000);
      if (recent.ok) {
        const arr = (await recent.json()) as any[];
        return Array.isArray(arr) ? arr.find((o) => o?.id === orderId) ?? null : null;
      }
    } catch (e) {
      this.logger.error(`getOrderFromInternal error: ${String(e)}`);
    }
    return null;
  }

  private async createSandboxCardToken(apikey: string): Promise<string | null> {
    const number = process.env.CLOVER_TEST_CARD_NUMBER || '4242424242424242';
    const exp_month = Number(process.env.CLOVER_TEST_CARD_EXP_MONTH || 12);
    const exp_year = Number(process.env.CLOVER_TEST_CARD_EXP_YEAR || 2030);
    const cvv = process.env.CLOVER_TEST_CARD_CVV || '123';

    try {
      const res = await this.fetchWithTimeout('https://token-sandbox.dev.clover.com/v1/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey },
        body: JSON.stringify({ card: { number, exp_month, exp_year, cvv } }),
      }, 15000);

      const text = await res.text().catch(() => '');
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

      if (!res.ok) {
        this.logger.error(`tokenize failed: ${res.status} ${res.statusText} :: ${text}`);
        return null;
      }
      const token = json?.id || json?.token || json?.source || json?.card_token;
      if (!token) {
        this.logger.warn(`tokenize response lacks token field: ${JSON.stringify(json)}`);
        return null;
      }
      return String(token);
    } catch (e) {
      this.logger.error(`tokenize error: ${String(e)}`);
      return null;
    }
  }

  private async createCharge(amountCents: number, currency: string, source: string, bearer: string) {
    const payload = { amount: amountCents, currency, source };
    const res = await this.fetchWithTimeout('https://scl-sandbox.dev.clover.com/v1/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(payload),
    }, 15000);

    const text = await res.text().catch(() => '');
    let json: any = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      this.logger.warn(`createCharge failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    return json ?? {};
  }

  private isChargeSuccess(charge: any) {
    const U = (x: any) => String(x ?? '').toUpperCase();
    const fields = [U(charge?.result), U(charge?.status), U(charge?.state), U(charge?.outcome), U(charge?.paymentState), U(charge?.code)];
    return fields.includes('SUCCESS') || fields.includes('APPROVED') || fields.includes('PAID') || fields.includes('SUCCEEDED') || fields.includes('OK');
  }

  private async markOrderPaidViaHttp(orderId: string) {
    const base = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 4000}/api`;
    try {
      const res = await this.fetchWithTimeout(`${base}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      }, 10000);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`markOrderPaidViaHttp failed: ${res.status} ${res.statusText} :: ${text}`);
      } else {
        this.logger.log(`Order ${orderId} marked as PAID`);
      }
    } catch (err) {
      this.logger.error(`markOrderPaidViaHttp error: ${String(err)}`);
    }
  }
}
