//apps/api/src/common/pipes/cuid.pipe.ts
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const CUID_V1_REGEX = /^c[a-z0-9]{24}$/;

@Injectable()
export class CuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const v = (value ?? '').trim();
    if (!CUID_V1_REGEX.test(v)) {
      throw new BadRequestException('invalid orderStableId (cuid required)');
    }
    return v;
  }
}
