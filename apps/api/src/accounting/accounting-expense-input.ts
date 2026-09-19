import { BadRequestException } from '@nestjs/common';

export function parseAccountingExpenseDate(raw: string, endOfDay = false) {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`invalid date: ${raw}`);
  }
  if (raw.length <= 10) {
    if (endOfDay) parsed.setHours(23, 59, 59, 999);
    else parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

export function assertAccountingExpenseMoney(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }
}

export function normalizeAccountingExpenseAttachmentUrls(urls?: string[]) {
  return Array.from(
    new Set(
      (urls ?? [])
        .map((value) => value.trim())
        .filter((value) => value.startsWith('/api/v1/accounting/files/')),
    ),
  );
}
