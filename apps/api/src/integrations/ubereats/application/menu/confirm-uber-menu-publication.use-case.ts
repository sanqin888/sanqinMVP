import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MENU_GATEWAY,
  UBER_MENU_PUBLICATION_REPOSITORY,
  type UberMenuGatewayPort,
  type UberMenuPublicationRepositoryPort,
} from '../ports/uber-menu-publication.ports';

@Injectable()
export class ConfirmUberMenuPublicationUseCase {
  constructor(
    @Inject(UBER_MENU_PUBLICATION_REPOSITORY)
    private readonly publications: UberMenuPublicationRepositoryPort,
    @Inject(UBER_MENU_GATEWAY) private readonly gateway: UberMenuGatewayPort,
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
      if (!attempt.uberResourceId) continue;
      const result = await this.gateway.getMenuPublicationStatus({
        storeId: attempt.storeId,
        uberResourceId: attempt.uberResourceId,
      });
      if (result.status !== 'PENDING')
        await this.publications.markConfirmed(
          attempt.attemptId,
          attempt.leaseToken,
          {
            status: result.status,
            uberRequestId: result.uberRequestId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          },
        );
    }
    return attempts.length;
  }
}
