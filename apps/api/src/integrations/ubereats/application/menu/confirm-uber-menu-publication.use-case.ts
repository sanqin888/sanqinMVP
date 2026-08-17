import type { UberMenuPublicationRepositoryPort } from './uber-menu-publication.ports';

/**
 * Closes legacy SUBMITTED rows created when menu PUT 204 responses were treated as
 * asynchronous publications. New uploads are marked SUCCEEDED immediately.
 */
export class ConfirmUberMenuPublicationUseCase {
  constructor(
    private readonly publications: UberMenuPublicationRepositoryPort,
  ) {}
  async execute(
    limit = 20,
    owner = `menu-confirm-${process.pid}`,
  ): Promise<number> {
    const attempts = await this.publications.claimDueConfirmations(limit, {
      owner,
      durationMs: 60_000,
      now: new Date(),
    });
    for (const attempt of attempts) {
      await this.publications.markConfirmed(
        attempt.attemptId,
        attempt.leaseToken,
        {
          status: 'SUCCEEDED',
          uberRequestId: attempt.uberRequestId,
          uberResourceId: attempt.uberResourceId,
          errorCode: null,
          errorMessage: null,
        },
      );
    }
    return attempts.length;
  }
}
