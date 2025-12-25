import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isStableId } from '../utils/stable-id';

@Injectable()
export class CuidOrUuidPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!isStableId(value)) {
      const label = metadata.data ?? 'id';
      throw new BadRequestException(`${label} must be a cuid`);
    }
    return value;
  }
}
