//apps/api/src/common/pipes/cuid.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isStableId } from '../utils/stable-id';

@Injectable()
export class CuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const v = (value ?? '').trim();
    if (!isStableId(v) || v !== v.toLowerCase()) {
      throw new BadRequestException('invalid orderStableId (cuid required)');
    }
    return v;
  }
}
