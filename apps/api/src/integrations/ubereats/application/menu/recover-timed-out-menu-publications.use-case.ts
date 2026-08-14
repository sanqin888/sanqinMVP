import { type UberMenuPublicationRepositoryPort } from './uber-menu-publication.ports';

/** Application policy for deciding when an unconfirmed publication is stale. */
export class RecoverTimedOutMenuPublicationsUseCase {
  constructor(
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
