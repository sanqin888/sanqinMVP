import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SQ_ORDERNO_REGEX = /^SQ\d{6}$/i;

// 允许：cuid v1（一般无 '-'，字母数字，长度合理）
const STABLE_ID_REGEX = /^[a-z0-9]{8,64}$/i;

@Injectable()
export class OrderRefPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const v = (value ?? '').trim();
    if (!v) throw new BadRequestException('orderRef is required');

    if (UUID_REGEX.test(v)) {
      throw new BadRequestException('stableId or clientRequestId only');
    }

    // SQ###### 统一大写
    if (SQ_ORDERNO_REGEX.test(v)) return v.toUpperCase();

    // stableId 不允许 '-'
    if (v.includes('-')) {
      throw new BadRequestException('stableId or clientRequestId only');
    }

    if (!STABLE_ID_REGEX.test(v)) {
      throw new BadRequestException('invalid orderRef');
    }

    return v;
  }
}
