// apps/api/src/common/utils/client-request-id.ts
import * as crypto from 'crypto';

const CLIENT_REQUEST_ID_TIMEZONE = 'America/Toronto';

export const CLIENT_REQUEST_ID_RE = /^SQ[A-Z]?\d{10}$/;

export const getClientRequestIdPrefix = (): string => {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'SQP';
  if (env === 'test') return 'SQT';
  return 'SQD';
};

export const formatClientRequestIdDate = (
  date: Date,
  timeZone: string = CLIENT_REQUEST_ID_TIMEZONE,
): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const yy = parts.find((p) => p.type === 'year')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '00';
  const dd = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${yy}${mm}${dd}`;
};

export const buildClientRequestId = (
  date: Date = new Date(),
  timeZone: string = CLIENT_REQUEST_ID_TIMEZONE,
): string => {
  const yymmdd = formatClientRequestIdDate(date, timeZone);
  const rand = crypto.randomInt(0, 10000).toString().padStart(4, '0');
  return `${getClientRequestIdPrefix()}${yymmdd}${rand}`;
};
