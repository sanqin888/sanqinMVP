import { Injectable } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import type { Lang, TemplateName, TemplateVarsMap } from './template-vars';

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const normalizeLocale = (locale?: string): Lang => {
  const normalized = locale?.toLowerCase() ?? '';
  if (normalized === 'zh-cn' || normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en';
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);

const getVar = (vars: Record<string, unknown>, key: string): unknown => {
  if (!key) return undefined;
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, vars);
};

const toTemplateString = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return value.name || '[function]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
};

const renderTemplateString = (
  template: string,
  vars: Record<string, unknown>,
): string => {
  const withRaw = template.replace(
    /\{\{\{\s*([\w.]+)\s*\}\}\}/g,
    (_, key: string) => {
      const value = getVar(vars, key);
      return toTemplateString(value);
    },
  );
  return withRaw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = getVar(vars, key);
    return escapeHtml(toTemplateString(value));
  });
};

@Injectable()
export class TemplateRenderer {
  private readonly templateCache = new Map<string, string>();
  private readonly templateRoot: string;

  constructor() {
    this.templateRoot = this.resolveTemplateRoot();
  }

  private resolveTemplateRoot(): string {
    const candidates = [
      path.resolve(process.cwd(), 'apps/api/src/messaging/templates'),
      path.resolve(process.cwd(), 'src/messaging/templates'),
      path.resolve(__dirname, 'templates'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private async loadTemplate(relativePath: string): Promise<string> {
    const cached = this.templateCache.get(relativePath);
    if (cached) return cached;
    const fullPath = path.join(this.templateRoot, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    this.templateCache.set(relativePath, content);
    return content;
  }

  private async renderTemplate(
    relativePath: string,
    vars: Record<string, unknown>,
  ): Promise<string> {
    const template = await this.loadTemplate(relativePath);
    return renderTemplateString(template, vars);
  }

  async renderEmail<T extends TemplateName>(params: {
    template: T;
    locale?: string;
    vars: TemplateVarsMap[T];
  }): Promise<{ subject: string; html: string; text: string }> {
    const locale = normalizeLocale(params.locale);
    const subject = await this.renderTemplate(
      path.join(locale, `${params.template}.email.subject.hbs`),
      params.vars,
    );
    const htmlBody = await this.renderTemplate(
      path.join(locale, `${params.template}.email.html.hbs`),
      params.vars,
    );
    const text = await this.renderTemplate(
      path.join(locale, `${params.template}.email.text.hbs`),
      params.vars,
    );
    const layout = await this.renderTemplate(
      path.join('common', 'emailLayout.hbs'),
      {
        ...params.vars,
        body: htmlBody,
      },
    );
    return { subject, html: layout, text };
  }

  async renderSms<T extends TemplateName>(params: {
    template: T;
    locale?: string;
    vars: TemplateVarsMap[T];
  }): Promise<string> {
    const locale = normalizeLocale(params.locale);
    return this.renderTemplate(
      path.join(locale, `${params.template}.sms.hbs`),
      params.vars,
    );
  }
}
