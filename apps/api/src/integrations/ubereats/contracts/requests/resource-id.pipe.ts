import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ResourceIdParam } from './ubereats.requests';

@Injectable()
export class ResourceIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const candidate = plainToInstance(ResourceIdParam, { id: value });
    if (validateSync(candidate).length) {
      throw new BadRequestException('资源 ID 格式无效');
    }
    return value;
  }
}

@Injectable()
export class OptionalResourceIdPipe implements PipeTransform<
  string | undefined,
  string | undefined
> {
  private readonly requiredPipe = new ResourceIdPipe();

  transform(value: string | undefined): string | undefined {
    return value === undefined ? undefined : this.requiredPipe.transform(value);
  }
}
