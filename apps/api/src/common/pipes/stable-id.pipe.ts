//apps/api/src/common/pipes/stable-id.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isStableId } from '../utils/stable-id';

@Injectable()
export class StableIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const v = (value ?? '').trim();
    if (!isStableId(v) || v !== v.toLowerCase()) {
      throw new BadRequestException('invalid stableId');
    }
    return v;
  }
}
