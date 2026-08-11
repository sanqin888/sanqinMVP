import { ConfirmUberMenuPublicationUseCase } from './confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from './recover-timed-out-menu-publications.use-case';

/** Coordinates confirmation and timeout recovery for one publication batch. */
export class ConfirmUberMenuPublicationsUseCase {
  constructor(
    private readonly confirmations: ConfirmUberMenuPublicationUseCase,
    private readonly recovery: RecoverTimedOutMenuPublicationsUseCase,
  ) {}

  async execute(limit = 20): Promise<number> {
    const confirmed = await this.confirmations.execute(limit);
    await this.recovery.execute(undefined, limit);
    return confirmed;
  }
}
