import { ApiError } from "@/lib/api/client";

type UberCancellationErrorPayload = {
  code?: unknown;
  message?: unknown;
  manualActionRequired?: unknown;
};

export const UBER_ACCEPTED_CANCELLATION_UNSUPPORTED =
  "UBER_ACCEPTED_CANCELLATION_UNSUPPORTED";

export function canDenyUberOrder(status: string): boolean {
  return status === "pending";
}

export function getUberCancellationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ApiError) || !isErrorPayload(error.payload)) {
    return fallback;
  }

  const { code, message, manualActionRequired } = error.payload;
  if (
    code === UBER_ACCEPTED_CANCELLATION_UNSUPPORTED &&
    manualActionRequired === true &&
    typeof message === "string" &&
    message.trim()
  ) {
    return message;
  }

  return fallback;
}

function isErrorPayload(value: unknown): value is UberCancellationErrorPayload {
  return typeof value === "object" && value !== null;
}
