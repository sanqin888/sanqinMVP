import { Test } from '@nestjs/testing';
import { UberHttpClient } from './uber-http.client';
import {
  DEFAULT_UBER_IMAGE_POLICY,
  UBER_IMAGE_POLICY,
  UberImageValidator,
} from './uber-image.validator';

describe('UberImageValidator dependency injection', () => {
  it('resolves its image policy through an explicit Nest token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UberImageValidator,
        { provide: UberHttpClient, useValue: {} },
        { provide: UBER_IMAGE_POLICY, useValue: DEFAULT_UBER_IMAGE_POLICY },
      ],
    }).compile();

    expect(moduleRef.get(UberImageValidator)).toBeInstanceOf(
      UberImageValidator,
    );
  });
});
