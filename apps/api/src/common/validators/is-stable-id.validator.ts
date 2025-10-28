import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isStableId } from '../utils/stable-id';

@ValidatorConstraint({ name: 'isStableId', async: false })
class IsStableIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === undefined || value === null || isStableId(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a cuid/uuid`;
  }
}

export function IsStableId(options?: ValidationOptions) {
  return function decorate(object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsStableIdConstraint,
    });
  };
}

export { IsStableIdConstraint };
