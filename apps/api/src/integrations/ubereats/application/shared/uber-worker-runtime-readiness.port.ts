export interface UberWorkerDurableFailures {
  readonly webhookInbox: number;
  readonly orderAction: number;
}

export interface UberWorkerRuntimeReadinessPort {
  probeDatabase(): Promise<boolean>;
  readDurableFailures(): Promise<UberWorkerDurableFailures>;
}

export const UBER_WORKER_RUNTIME_READINESS_PORT = Symbol(
  'UBER_WORKER_RUNTIME_READINESS_PORT',
);
