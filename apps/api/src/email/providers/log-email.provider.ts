import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailProvider,
  EmailSendParams,
  EmailSendResult,
} from '../email.provider';

@Injectable()
export class LogEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LogEmailProvider.name);

  sendEmail(params: EmailSendParams): Promise<EmailSendResult> {
    const fromLabel = params.fromAddress
      ? `${params.fromName ?? ''} <${params.fromAddress}>`.trim()
      : 'default';
    this.logger.log(
      `[DEV] Email from ${fromLabel} to ${params.to}: ${params.subject} :: ${params.text ?? '[html only]'}`,
    );
    return Promise.resolve({ ok: true });
  }
}
