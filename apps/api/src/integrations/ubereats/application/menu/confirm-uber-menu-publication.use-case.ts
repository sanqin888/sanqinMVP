import {
  type UberMenuGatewayPort,
  type UberMenuPublicationRepositoryPort,
} from './uber-menu-publication.ports';

export class ConfirmUberMenuPublicationUseCase {
  constructor(
    private readonly publications: UberMenuPublicationRepositoryPort,
    private readonly gateway: UberMenuGatewayPort,
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
      if (!attempt.uberResourceId) {
        await this.publications.markConfirmed(
          attempt.attemptId,
          attempt.leaseToken,
          {
            status: 'FAILED',
            uberRequestId: null,
            uberResourceId: null,
            errorCode: 'MISSING_RESOURCE_ID',
            errorMessage: 'Uber upload did not return a resource id',
          },
        );
        continue;
      }
      const result = await this.gateway.getMenuPublicationStatus({
        storeId: attempt.storeId,
        uberResourceId: attempt.uberResourceId,
      });
      if (result.status === 'PENDING') {
        await this.publications.rescheduleConfirmation(
          attempt.attemptId,
          attempt.leaseToken,
          new Date(Date.now() + 15_000),
        );
      } else {
        await this.publications.markConfirmed(
          attempt.attemptId,
          attempt.leaseToken,
          {
            status: result.status,
            uberRequestId: result.uberRequestId,
            uberResourceId: attempt.uberResourceId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        );
      }
    }
    return attempts.length;
  }
}
