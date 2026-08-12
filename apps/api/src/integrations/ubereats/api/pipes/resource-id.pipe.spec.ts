import { BadRequestException } from '@nestjs/common';

import { OptionalResourceIdPipe, ResourceIdPipe } from './resource-id.pipe';

describe('ResourceIdPipe', () => {
  const pipe = new ResourceIdPipe();

  it('returns a valid resource ID unchanged', () => {
    expect(pipe.transform('store_123-abc')).toBe('store_123-abc');
  });

  it.each([' leading-space', 'slash/value', '', 'a'.repeat(129), 123])(
    'maps the invalid value %p to a bad request',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});

describe('OptionalResourceIdPipe', () => {
  const pipe = new OptionalResourceIdPipe();

  it('accepts an omitted value', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('applies resource ID validation to a supplied value', () => {
    expect(() => pipe.transform('invalid/value')).toThrow(BadRequestException);
  });
});
