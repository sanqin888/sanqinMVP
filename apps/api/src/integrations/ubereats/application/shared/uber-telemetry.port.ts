/** Business-agnostic observability boundary shared by application capabilities. */
export interface UberTelemetryPort {
  captureEvent(
    eventName: string,
    attributes?: Record<string, unknown>,
  ): Promise<void>;
  workflowLog(
    level: 'debug' | 'log' | 'warn' | 'error',
    message?: unknown,
    details?: Record<string, unknown>,
  ): void;
}
export const UBER_TELEMETRY_PORT = Symbol('UBER_TELEMETRY_PORT');
