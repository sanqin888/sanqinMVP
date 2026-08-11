import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MENU_PUBLICATION_REPOSITORY,
  type UberMenuPublicationRepositoryPort,
} from '../ports/uber-menu-publication.ports';

/** Application policy for deciding when an unconfirmed publication is stale. */
@Injectable()
export class RecoverTimedOutMenuPublicationsUseCase {
  constructor(
    @Inject(UBER_MENU_PUBLICATION_REPOSITORY)
    private readonly publications: UberMenuPublicationRepositoryPort,
  ) {}

  async execute(timeoutMs = 30 * 60_000, limit = 100): Promise<number> {
    const now = new Date();
    const attempts = await this.publications.claimTimedOutConfirmations(
      new Date(now.getTime() - timeoutMs),
      limit,
      { owner: `menu-recovery-${process.pid}`, durationMs: 60_000, now },
    );
    let recovered = 0;
    for (const attempt of attempts) {
      if (
        await this.publications.markConfirmationTimedOut(
          attempt.attemptId,
          attempt.leaseToken,
        )
      )
        recovered += 1;
    }
    return recovered;
  }
}
