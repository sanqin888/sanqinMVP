import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodTypeAny } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(this.formatZodError(result.error));
    }

    return result.data as unknown;
  }

  private formatZodError(error: ZodError) {
    return {
      message: 'Validation failed',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
}
