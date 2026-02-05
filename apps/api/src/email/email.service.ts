import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MessagingChannel,
  MessagingTemplateType,
  MessagingProvider,
  MessagingSendStatus,
  Prisma,
  SuppressionReason,
  UserLanguage,
} from '@prisma/client';
import { BusinessConfigService } from '../messaging/business-config.service';
import type { EmailProvider } from './email.provider';
import { EMAIL_PROVIDER_TOKEN } from './email.tokens';
import type { PrintPosPayloadDto } from '../pos/dto/print-pos-payload.dto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../common/utils/email';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly baseUrl = process.env.PUBLIC_BASE_URL ?? 'https://sanq.ca';

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly businessConfigService: BusinessConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async sendEmail(params: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    tags?: Record<string, string>;
    locale?: string;
    fromName?: string;
    fromAddress?: string;
    templateType: MessagingTemplateType;
    templateVersion?: string;
    userId?: string;
    metadata?: Record<string, unknown> | null;
    skipSuppression?: boolean;
  }): Promise<{
    ok: boolean;
    messageId?: string;
    error?: string;
    sendId: string;
  }> {
    const {
      locale,
      templateType,
      templateVersion,
      userId,
      metadata,
      skipSuppression,
      ...payload
    } = params;
    const toAddressNorm = normalizeEmail(params.to) ?? params.to.trim();
    const sendRecord = await this.prisma.messagingSend.create({
      data: {
        channel: MessagingChannel.EMAIL,
        provider: this.resolveProvider(),
        toAddressNorm,
        toAddressRaw: params.to,
        fromAddress: params.fromAddress ?? null,
        templateType,
        templateVersion: templateVersion ?? null,
        locale: locale ? this.resolveLanguageEnum(locale) : null,
        userId: userId ?? null,
        statusLatest: MessagingSendStatus.QUEUED,
        metadata: this.buildSendMetadata({
          base: metadata,
          subject: params.subject,
          tags: params.tags,
        }),
      },
    });

    if (!skipSuppression) {
      const suppression = await this.checkSuppression(params.to);
      if (suppression.suppressed) {
        await this.prisma.messagingSend.update({
          where: { id: sendRecord.id },
          data: {
            statusLatest: MessagingSendStatus.FAILED,
            errorCodeLatest: 'SUPPRESSED',
            errorMessageLatest: suppression.reason ?? null,
          },
        });
        this.logger.warn(
          `Email suppressed for ${suppression.email} reason=${suppression.reason ?? 'unknown'}`,
        );
        return {
          ok: false,
          error: `suppressed:${suppression.reason ?? 'unknown'}`,
          sendId: sendRecord.id,
        };
      }
    }

    const messagingConfig =
      await this.businessConfigService.getMessagingSnapshot(locale);
    const result = await this.provider.sendEmail({
      ...payload,
      fromName: params.fromName ?? messagingConfig.emailFromName,
      fromAddress: params.fromAddress ?? messagingConfig.emailFromAddress,
    });

    if (result.ok) {
      await this.prisma.messagingSend.update({
        where: { id: sendRecord.id },
        data: {
          statusLatest: MessagingSendStatus.SENT,
          providerMessageId: result.messageId ?? null,
        },
      });
      return { ...result, sendId: sendRecord.id };
    }

    await this.prisma.messagingSend.update({
      where: { id: sendRecord.id },
      data: {
        statusLatest: MessagingSendStatus.FAILED,
        errorCodeLatest: result.error ? 'PROVIDER_ERROR' : null,
        errorMessageLatest: result.error ?? null,
      },
    });
    this.logger.warn(`Email send failed: ${result.error ?? 'unknown'}`);
    return { ...result, sendId: sendRecord.id };
  }

  private async checkSuppression(email: string): Promise<{
    suppressed: boolean;
    email?: string;
    reason?: SuppressionReason;
  }> {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return { suppressed: false };
    }

    const suppression = await this.prisma.messagingSuppression.findFirst({
      where: {
        channel: MessagingChannel.EMAIL,
        addressNorm: normalized,
        liftedAt: null,
      },
    });
    if (!suppression) {
      return { suppressed: false };
    }
    return {
      suppressed: true,
      email: normalized,
      reason: suppression.reason,
    };
  }

  private resolveProvider(): MessagingProvider {
    const provider = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
    if (provider === 'ses') return MessagingProvider.AWS_SES;
    if (provider === 'sendgrid') return MessagingProvider.SENDGRID;
    return MessagingProvider.MANUAL;
  }

  private resolveLocale(locale?: string): 'zh' | 'en' {
    const normalized = locale?.toLowerCase() ?? '';
    return normalized.startsWith('zh') ? 'zh' : 'en';
  }

  private resolveLanguageEnum(locale: string): UserLanguage {
    return locale.toLowerCase().startsWith('zh')
      ? UserLanguage.ZH
      : UserLanguage.EN;
  }

  private buildSendMetadata(params: {
    base?: Record<string, unknown> | null;
    subject: string;
    tags?: Record<string, string>;
  }): Prisma.InputJsonValue {
    const { base, subject, tags } = params;
    return {
      ...(base ?? {}),
      subject,
      tags: tags ?? null,
    } as Prisma.InputJsonValue;
  }

  private formatCurrency(cents: number, locale: 'zh' | 'en'): string {
    const formatter = new Intl.NumberFormat(
      locale === 'zh' ? 'zh-Hans-CA' : 'en-CA',
      {
        style: 'currency',
        currency: 'CAD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );
    return formatter.format(cents / 100).replace(/^CA\$\s?/, '$');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private stripAddressLabel(value: string): string {
    return value.replace(/^[^:：]+[:：]\s*/, '').trim();
  }

  private buildInvoiceHtml(params: {
    payload: PrintPosPayloadDto;
    locale: 'zh' | 'en';
    storeName: string;
    storeAddress: string;
    storePhone?: string;
    supportEmail?: string;
  }): string {
    const {
      payload,
      locale,
      storeName,
      storeAddress,
      storePhone,
      supportEmail,
    } = params;
    const labels =
      locale === 'zh'
        ? {
            title: '正式账单',
            orderNumber: '订单编号',
            items: '菜品明细',
            quantity: '数量',
            amount: '金额',
            subtotal: '小计',
            discount: '优惠',
            deliveryFee: '配送费',
            tax: '税费',
            total: '合计',
            storeInfo: '门店信息',
            contact: '联系方式',
          }
        : {
            title: 'Invoice',
            orderNumber: 'Order number',
            items: 'Items',
            quantity: 'Qty',
            amount: 'Amount',
            subtotal: 'Subtotal',
            discount: 'Discount',
            deliveryFee: 'Delivery fee',
            tax: 'Tax',
            total: 'Total',
            storeInfo: 'Store information',
            contact: 'Contact',
          };

    const itemRows = payload.snapshot.items
      .map((item) => {
        const name =
          locale === 'zh'
            ? (item.nameZh ??
              item.displayName ??
              item.nameEn ??
              item.productStableId)
            : (item.nameEn ??
              item.displayName ??
              item.nameZh ??
              item.productStableId);
        const safeName = this.escapeHtml(name);
        const options = Array.isArray(item.options) ? item.options : [];
        const optionsHtml =
          options.length > 0
            ? `<div style="margin-top:4px;color:#64748b;font-size:12px;">${options
                .map((group) => {
                  const groupName =
                    locale === 'zh'
                      ? (group.nameZh ?? group.nameEn)
                      : group.nameEn;
                  const choices = group.choices
                    .map((choice) => {
                      const choiceName =
                        locale === 'zh'
                          ? (choice.nameZh ?? choice.nameEn)
                          : choice.nameEn;
                      const delta =
                        choice.priceDeltaCents !== 0
                          ? ` (${choice.priceDeltaCents > 0 ? '+' : '-'}${this.formatCurrency(
                              Math.abs(choice.priceDeltaCents),
                              locale,
                            )})`
                          : '';
                      return `${this.escapeHtml(choiceName)}${delta}`;
                    })
                    .join(', ');
                  return `<div><strong>${this.escapeHtml(
                    groupName,
                  )}</strong>: ${choices}</div>`;
                })
                .join('')}</div>`
            : '';
        return `
          <tr>
            <td style="padding:8px 0;vertical-align:top;">
              <div style="font-weight:600;color:#0f172a;">${safeName}</div>
              ${optionsHtml}
            </td>
            <td style="padding:8px 0;text-align:center;vertical-align:top;color:#475569;">
              ${item.quantity}
            </td>
            <td style="padding:8px 0;text-align:right;vertical-align:top;color:#0f172a;font-weight:600;">
              ${this.formatCurrency(item.lineTotalCents, locale)}
            </td>
          </tr>
        `;
      })
      .join('');

    const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
      {
        label: labels.subtotal,
        value: this.formatCurrency(payload.snapshot.subtotalCents, locale),
      },
    ];
    if (payload.snapshot.discountCents > 0) {
      rows.push({
        label: labels.discount,
        value: `-${this.formatCurrency(payload.snapshot.discountCents, locale)}`,
      });
    }
    if (payload.snapshot.deliveryFeeCents > 0) {
      rows.push({
        label: labels.deliveryFee,
        value: this.formatCurrency(payload.snapshot.deliveryFeeCents, locale),
      });
    }
    rows.push({
      label: labels.tax,
      value: this.formatCurrency(payload.snapshot.taxCents, locale),
    });
    rows.push({
      label: labels.total,
      value: this.formatCurrency(payload.snapshot.totalCents, locale),
      highlight: true,
    });

    const rowsHtml = rows
      .map(
        (row) => `
        <tr>
          <td style="padding:6px 0;color:#475569;">${row.label}</td>
          <td style="padding:6px 0;text-align:right;color:${
            row.highlight ? '#0f172a' : '#334155'
          };font-weight:${row.highlight ? 700 : 500};">
            ${row.value}
          </td>
        </tr>
      `,
      )
      .join('');

    const contactLines = [
      storePhone ? `${labels.contact}：${this.escapeHtml(storePhone)}` : '',
      supportEmail ? this.escapeHtml(supportEmail) : '',
    ]
      .filter(Boolean)
      .join('<br />');

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#ffffff;padding:24px;">
        <div style="max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:18px;font-weight:700;">${this.escapeHtml(
              storeName,
            )}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">
              ${labels.title}
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="font-size:14px;color:#475569;">${
              labels.orderNumber
            }：<strong>${this.escapeHtml(payload.orderNumber)}</strong></div>
          </div>
          <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${
              labels.items
            }</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="text-align:left;color:#64748b;font-size:12px;">
                  <th style="padding-bottom:8px;">${labels.items}</th>
                  <th style="padding-bottom:8px;text-align:center;">${
                    labels.quantity
                  }</th>
                  <th style="padding-bottom:8px;text-align:right;">${
                    labels.amount
                  }</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </div>
          <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px;font-size:12px;color:#64748b;">
            <div style="font-weight:600;margin-bottom:6px;">${
              labels.storeInfo
            }</div>
            <div>${this.escapeHtml(storeAddress)}</div>
            ${contactLines ? `<div style="margin-top:6px;">${contactLines}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private buildInvoiceText(params: {
    payload: PrintPosPayloadDto;
    locale: 'zh' | 'en';
    storeName: string;
    storeAddress: string;
    storePhone?: string;
    supportEmail?: string;
  }): string {
    const {
      payload,
      locale,
      storeName,
      storeAddress,
      storePhone,
      supportEmail,
    } = params;
    const labels =
      locale === 'zh'
        ? {
            title: '正式账单',
            orderNumber: '订单编号',
            items: '菜品明细',
            subtotal: '小计',
            discount: '优惠',
            deliveryFee: '配送费',
            tax: '税费',
            total: '合计',
          }
        : {
            title: 'Invoice',
            orderNumber: 'Order number',
            items: 'Items',
            subtotal: 'Subtotal',
            discount: 'Discount',
            deliveryFee: 'Delivery fee',
            tax: 'Tax',
            total: 'Total',
          };

    const itemLines = payload.snapshot.items
      .map((item) => {
        const name =
          locale === 'zh'
            ? (item.nameZh ??
              item.displayName ??
              item.nameEn ??
              item.productStableId)
            : (item.nameEn ??
              item.displayName ??
              item.nameZh ??
              item.productStableId);
        const options = Array.isArray(item.options) ? item.options : [];
        const optionLines = options
          .map((group) => {
            const groupName =
              locale === 'zh' ? (group.nameZh ?? group.nameEn) : group.nameEn;
            const choices = group.choices
              .map((choice) => {
                const choiceName =
                  locale === 'zh'
                    ? (choice.nameZh ?? choice.nameEn)
                    : choice.nameEn;
                const delta =
                  choice.priceDeltaCents !== 0
                    ? ` (${choice.priceDeltaCents > 0 ? '+' : '-'}${this.formatCurrency(
                        Math.abs(choice.priceDeltaCents),
                        locale,
                      )})`
                    : '';
                return `${choiceName}${delta}`;
              })
              .join(', ');
            return `  - ${groupName}: ${choices}`;
          })
          .join('\n');
        return `- ${name} x${item.quantity}: ${this.formatCurrency(
          item.lineTotalCents,
          locale,
        )}${optionLines ? `\n${optionLines}` : ''}`;
      })
      .join('\n');

    const totalLines: string[] = [
      `${labels.subtotal}: ${this.formatCurrency(
        payload.snapshot.subtotalCents,
        locale,
      )}`,
    ];
    if (payload.snapshot.discountCents > 0) {
      totalLines.push(
        `${labels.discount}: -${this.formatCurrency(
          payload.snapshot.discountCents,
          locale,
        )}`,
      );
    }
    if (payload.snapshot.deliveryFeeCents > 0) {
      totalLines.push(
        `${labels.deliveryFee}: ${this.formatCurrency(
          payload.snapshot.deliveryFeeCents,
          locale,
        )}`,
      );
    }
    totalLines.push(
      `${labels.tax}: ${this.formatCurrency(
        payload.snapshot.taxCents,
        locale,
      )}`,
    );
    totalLines.push(
      `${labels.total}: ${this.formatCurrency(
        payload.snapshot.totalCents,
        locale,
      )}`,
    );

    const contactLines = [storePhone, supportEmail].filter(Boolean).join('\n');

    return `${storeName}
${storeAddress}
${contactLines ? `${contactLines}\n` : ''}

${labels.title}
${labels.orderNumber}: ${payload.orderNumber}

${labels.items}:
${itemLines}

${totalLines.join('\n')}`;
  }

  async sendOrderInvoice(params: {
    to: string;
    payload: PrintPosPayloadDto;
    locale?: string;
  }) {
    const resolvedLocale = this.resolveLocale(
      params.locale ?? params.payload.locale,
    );
    const messagingConfig =
      await this.businessConfigService.getMessagingSnapshot(resolvedLocale);
    const snapshot = await this.businessConfigService.getSnapshot();

    const storeName =
      snapshot.storeName?.trim() || messagingConfig.baseVars.brandName;

    const addressParts = [
      snapshot.storeAddressLine1,
      snapshot.storeAddressLine2,
      snapshot.storeCity,
      snapshot.storeProvince,
      snapshot.storePostalCode,
    ]
      .map((part) => part?.trim())
      .filter((part): part is string => !!part);

    const fallbackAddress = messagingConfig.baseVars.storeAddressLine
      ? this.stripAddressLabel(messagingConfig.baseVars.storeAddressLine)
      : '';

    const storeAddress =
      addressParts.length > 0 ? addressParts.join(', ') : fallbackAddress;

    const html = this.buildInvoiceHtml({
      payload: params.payload,
      locale: resolvedLocale,
      storeName,
      storeAddress,
      storePhone:
        snapshot.supportPhone ?? messagingConfig.baseVars.supportPhone,
      supportEmail: messagingConfig.baseVars.supportEmail,
    });
    const text = this.buildInvoiceText({
      payload: params.payload,
      locale: resolvedLocale,
      storeName,
      storeAddress,
      storePhone:
        snapshot.supportPhone ?? messagingConfig.baseVars.supportPhone,
      supportEmail: messagingConfig.baseVars.supportEmail,
    });

    const subject =
      resolvedLocale === 'zh'
        ? `订单 ${params.payload.orderNumber} 的正式账单`
        : `Invoice for order ${params.payload.orderNumber}`;

    return this.sendEmail({
      to: params.to,
      subject,
      html,
      text,
      tags: { type: 'invoice' },
      locale: resolvedLocale === 'zh' ? 'zh-CN' : 'en',
      templateType: MessagingTemplateType.RECEIPT,
    });
  }

  async sendVerificationEmail(params: {
    to: string;
    token: string;
    name?: string | null;
    locale?: string;
  }) {
    const verifyUrl = `${this.baseUrl}/verify-email?token=${params.token}`;
    const resolvedLocale = this.resolveLocale(params.locale);
    const greeting =
      resolvedLocale === 'zh'
        ? params.name
          ? `您好，${params.name}：`
          : '您好：'
        : params.name
          ? `Hi ${params.name},`
          : 'Hi,';
    const subject =
      resolvedLocale === 'zh' ? '验证您的邮箱' : 'Verify your email';
    const text =
      resolvedLocale === 'zh'
        ? `${greeting}\n\n邮箱验证码：${params.token}\n\n请点击以下链接验证邮箱：${verifyUrl}\n\n链接有效期为 24 小时。`
        : `${greeting}\n\nYour verification code: ${params.token}\n\nPlease verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`;
    const html =
      resolvedLocale === 'zh'
        ? `
      <p>${greeting}</p>
      <p>邮箱验证码：<strong>${params.token}</strong></p>
      <p>请点击以下链接验证邮箱：</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>链接有效期为 24 小时。</p>
    `
        : `
      <p>${greeting}</p>
      <p>Your verification code: <strong>${params.token}</strong></p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html,
      tags: { type: 'email_verification' },
      locale: params.locale,
      templateType: MessagingTemplateType.EMAIL_VERIFY_LINK,
    });
  }

  async sendStaffInviteEmail(params: {
    to: string;
    token: string;
    role: string;
    inviterName?: string | null;
    locale?: string;
  }) {
    const inviteUrl = `${this.baseUrl}/admin/accept-invite?token=${encodeURIComponent(params.token)}`;
    const resolvedLocale = this.resolveLocale(params.locale);
    if (resolvedLocale === 'zh') {
      const subject = '邀请您加入 Sanqin 团队';
      const roleName = params.role === 'ADMIN' ? '管理员' : '普通员工';
      const inviterLine = params.inviterName ?? '管理员';
      const text = `您好，\n\n${inviterLine} 邀请您以 ${roleName} 身份加入管理后台。\n请点击以下链接设置密码并激活账号：\n${inviteUrl}\n\n此链接有效期为 7 天。如果这不是您预期的操作，请忽略此邮件。`;
      const html = `
      <p>您好，</p>
      <p>${inviterLine} 邀请您以 <strong>${roleName}</strong> 身份加入管理后台。</p>
      <p>请点击下方链接设置您的登录密码并激活账号：</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>此链接有效期为 7 天。如果这不是您预期的操作，请忽略此邮件。</p>
    `;
      return this.sendEmail({
        to: params.to,
        subject,
        text,
        html,
        tags: { type: 'staff_invite' },
        locale: params.locale,
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
      });
    }

    const subject = 'You are invited to join the Sanqin team';
    const roleName = params.role === 'ADMIN' ? 'Admin' : 'Staff';
    const inviterLine = params.inviterName ?? 'an admin';
    const text = `Hello,\n\n${inviterLine} invited you to join the admin dashboard as ${roleName}.\nPlease click the link below to set your password and activate your account:\n${inviteUrl}\n\nThis link expires in 7 days. If you did not expect this invitation, you can ignore this email.`;
    const html = `
      <p>Hello,</p>
      <p>${inviterLine} invited you to join the admin dashboard as <strong>${roleName}</strong>.</p>
      <p>Please click the link below to set your password and activate your account:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>This link expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
    `;

    return this.sendEmail({
      to: params.to,
      subject,
      text,
      html,
      tags: { type: 'staff_invite' },
      locale: params.locale,
      templateType: MessagingTemplateType.SIGNUP_WELCOME,
    });
  }
}
