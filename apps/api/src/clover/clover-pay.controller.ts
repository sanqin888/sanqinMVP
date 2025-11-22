import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { CloverService } from './clover.service';
import {
  CreateHostedCheckoutDto,
  HOSTED_CHECKOUT_CURRENCY,
} from './dto/create-hosted-checkout.dto'; // ✅ 用你已有的 DTO
import { CheckoutIntentsService } from './checkout-intents.service';
import {
  parseHostedCheckoutMetadata,
  type HostedCheckoutMetadata,
} from './hco-metadata';

@Controller('clover')
export class CloverPayController {
  constructor(
    private readonly clover: CloverService,
    private readonly checkoutIntents: CheckoutIntentsService,
  ) {}

  @Post('pay/online/hosted-checkout')
  async createCheckout(@Body() dto: CreateHostedCheckoutDto) {
    if (!dto.metadata) {
      throw new BadRequestException({
        code: 'CHECKOUT_METADATA_REQUIRED',
        message: 'metadata is required to create a hosted checkout session',
      });
    }

    let metadata: HostedCheckoutMetadata;
    try {
      metadata = parseHostedCheckoutMetadata(dto.metadata);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_METADATA',
        message:
          error instanceof Error
            ? error.message
            : 'invalid hosted checkout metadata payload',
      });
    }

    const result = await this.clover.createHostedCheckout(dto);

    if (!result.ok) {
      const friendly = interpretCheckoutFailure(result.reason);

      if (friendly?.type === 'card-declined') {
        throw new BadRequestException({
          code: friendly.code,
          message: friendly.message,
          reason: friendly.reason,
        });
      }

      throw new BadGatewayException({
        code: 'CLOVER_CHECKOUT_FAILED',
        message: `Failed to create Clover hosted checkout: ${result.reason}`,
        reason: result.reason,
      });
    }

    const currency = dto.currency ?? HOSTED_CHECKOUT_CURRENCY;
    const trimmedReference = dto.referenceId?.trim();
    const referenceId =
      (trimmedReference && trimmedReference.length > 0
        ? trimmedReference
        : undefined) ??
      result.checkoutSessionId ??
      metadata.customer.phone;

    await this.checkoutIntents.recordIntent({
      referenceId,
      checkoutSessionId: result.checkoutSessionId,
      amountCents: dto.amountCents,
      currency,
      locale: metadata.locale,
      metadata,
    });

    return {
      checkoutUrl: result.href,
      checkoutId: result.checkoutSessionId,
    };
  }
}

type FailureInsight =
  | {
      type: 'card-declined';
      code: string;
      message: string;
      reason: string;
    }
  | undefined;

function interpretCheckoutFailure(reason: unknown): FailureInsight {
  if (typeof reason !== 'string' || reason.trim() === '') return undefined;

  const meta = extractCloverErrorMeta(reason);
  const haystack = `${reason} ${meta?.message ?? ''}`.toLowerCase();
  const matchedCardDecline =
    (meta?.code ?? '').toLowerCase() === 'card_declined' ||
    (meta?.declineCode ?? '').toLowerCase() === 'issuer_declined' ||
    haystack.includes('card_declined') ||
    (haystack.includes('decline') && haystack.includes('card'));

  if (!matchedCardDecline) return undefined;

  const limitHit = haystack.includes(
    'sale count per card is greater than configured amount',
  );

  const zhMessage = limitHit
    ? '银行卡支付失败：该卡今日交易次数已达到银行设定上限，请尝试使用其他银行卡或联系发卡行。'
    : '银行卡支付失败：银行拒绝了本次交易，请尝试更换银行卡或联系发卡行确认。';
  const enMessage = limitHit
    ? 'Card declined: this card has reached the bank’s allowed number of sales today. Please try a different card or contact your bank.'
    : 'Card declined by the issuing bank. Please try a different card or contact your bank for assistance.';

  return {
    type: 'card-declined',
    code: 'CLOVER_CARD_DECLINED',
    message: `${zhMessage} ${enMessage}`,
    reason,
  };
}

type CloverErrorMeta = {
  code?: string;
  declineCode?: string;
  message?: string;
};

function extractCloverErrorMeta(reason: string): CloverErrorMeta | undefined {
  const attempts = collectReasonCandidates(reason);

  for (const candidate of attempts) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const meta = normalizeCloverErrorPayload(parsed);
      if (meta) return meta;
    } catch {
      const cleaned = candidate.replace(/\\"/g, '"');
      try {
        const parsed: unknown = JSON.parse(cleaned);
        const meta = normalizeCloverErrorPayload(parsed);
        if (meta) return meta;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

function collectReasonCandidates(reason: string): string[] {
  const trimmed = reason.trim();
  const candidates: string[] = [];

  if (trimmed) {
    candidates.push(trimmed);
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      candidates.push(trimmed.slice(1, -1));
    }
  }

  const jsonMatch = reason.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const match = jsonMatch[0];
    candidates.push(match);
    if (match.startsWith('"') && match.endsWith('"')) {
      candidates.push(match.slice(1, -1));
    }
  }

  return Array.from(new Set(candidates)).filter((entry) => entry.trim() !== '');
}

function normalizeCloverErrorPayload(
  payload: unknown,
): CloverErrorMeta | undefined {
  if (!payload || typeof payload !== 'object') return undefined;

  const record = payload as Record<string, unknown>;
  const errorRaw = record.error;
  const error =
    errorRaw && typeof errorRaw === 'object'
      ? (errorRaw as Record<string, unknown>)
      : undefined;

  const code = typeof error?.code === 'string' ? error.code : undefined;
  const declineCode =
    typeof error?.declineCode === 'string' ? error.declineCode : undefined;
  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : undefined;

  if (!code && !declineCode && !message) return undefined;

  return { code, declineCode, message };
}
