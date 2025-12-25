//apps/api/src/common/pipes/stable-id.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// cuid v1: 25 chars, starts with 'c'
const CUID_V1_REGEX = /^c[0-9a-z]{24}$/;

function isStableId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return CUID_V1_REGEX.test(v);
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
