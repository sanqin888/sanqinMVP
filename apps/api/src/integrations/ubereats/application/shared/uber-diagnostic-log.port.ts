/**
 * Application-owned diagnostic logging boundary.
 *
 * This port is intentionally log-only: it must not persist OpsEvent records or
 * otherwise turn merchant workflow diagnostics into business side effects.
 */
export interface UberDiagnosticLogPort {
  diagnosticLog(context: string, message: string): void;
}

export const UBER_DIAGNOSTIC_LOG_PORT = Symbol('UBER_DIAGNOSTIC_LOG_PORT');
