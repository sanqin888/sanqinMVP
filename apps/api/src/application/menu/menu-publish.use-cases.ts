import type { UberMenuUploadPayload } from '../../integrations/ubereats/uber-menu.types';
export interface PreparedMenuPublish {
  storeId: string;
  uberStoreId: string;
  versionStableId: string;
  payload: UberMenuUploadPayload;
}
export interface MenuPublishPort {
  prepare(input: unknown): Promise<PreparedMenuPublish>;
  submit(prepared: PreparedMenuPublish): Promise<{ resourceId: string | null }>;
  confirm(input: {
    versionStableId: string;
    resourceId: string | null;
  }): Promise<'SUBMITTED' | 'SUCCEEDED' | 'FAILED'>;
}
/** Builds and validates exactly one immutable publication version. */
export class PrepareMenuPublishUseCase {
  constructor(private readonly port: MenuPublishPort) {}
  execute(input: unknown) {
    return this.port.prepare(input);
  }
}
/** Submits once and returns immediately; it never polls Uber. */
export class SubmitMenuPublishUseCase {
  constructor(private readonly port: MenuPublishPort) {}
  execute(input: PreparedMenuPublish) {
    return this.port.submit(input);
  }
}
/** Worker/webhook entry point for terminal-state reconciliation. */
export class ConfirmMenuPublishUseCase {
  constructor(private readonly port: MenuPublishPort) {}
  execute(input: { versionStableId: string; resourceId: string | null }) {
    return this.port.confirm(input);
  }
}
