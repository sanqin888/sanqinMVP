import { UberPrismaAccessService } from './uber-prisma-access.service';

/**
 * Persistence-internal bridge providers. Keeping this list in the persistence
 * boundary prevents the composition root from depending on delegate access.
 */
export const UBER_PERSISTENCE_INTERNAL_PROVIDERS = [
  UberPrismaAccessService,
] as const;
