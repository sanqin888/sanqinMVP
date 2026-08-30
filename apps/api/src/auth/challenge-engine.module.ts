import { Module } from '@nestjs/common';
import { IDENTITY_CHALLENGE_ENGINE } from './challenge-engine.port';
import { ChallengeEngine } from './challenge-engine.service';

@Module({
  providers: [
    ChallengeEngine,
    {
      provide: IDENTITY_CHALLENGE_ENGINE,
      useExisting: ChallengeEngine,
    },
  ],
  exports: [IDENTITY_CHALLENGE_ENGINE],
})
export class IdentityChallengeModule {}

