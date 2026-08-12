import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

import { normalizeUberResourceId } from '../../domain/shared/uber-resource-id';

@Injectable()
export class ResourceIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const resourceId = normalizeUberResourceId(value);
    if (resourceId === undefined) {
      throw new BadRequestException('资源 ID 格式无效');
    }
    return resourceId;
  }
}

@Injectable()
export class OptionalResourceIdPipe implements PipeTransform<
  unknown,
  string | undefined
> {
  private readonly requiredPipe = new ResourceIdPipe();

  transform(value: unknown): string | undefined {
    return value === undefined ? undefined : this.requiredPipe.transform(value);
  }
}
