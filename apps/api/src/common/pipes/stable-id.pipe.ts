//apps/api/src/common/pipes/stable-id.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// cuid v1: 25 chars, starts with 'c'
const CUID1_REGEX = /^c[0-9a-z]{24}$/;

// cuid2: 24 chars base36（Prisma cuid2() 常见形态），不含 '-'
const CUID2_REGEX = /^[0-9a-z]{24}$/;

function isStableId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // 明确排除 UUID 形态（含 '-'）
  if (v.includes('-')) return false;
  return CUID1_REGEX.test(v) || CUID2_REGEX.test(v);
}

@Injectable()
export class StableIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const v = (value ?? '').trim();
    if (!isStableId(v)) {
      throw new BadRequestException('invalid stableId');
    }
    return v;
  }
}
