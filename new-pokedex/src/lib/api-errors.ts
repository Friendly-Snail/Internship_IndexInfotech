import { ORPCError } from "@orpc/client";

/**
 * Prefer the API's helpful error message, falling back when the request never reached it.
 *
 * @param error - The value thrown by an oRPC call.
 * @param fallback - Message used for network failures and unreadable responses.
 * @returns A message that is safe to show in the page.
 */
export function errorMessage(error: unknown, fallback: string): string {
  // the server translates every failure into an ORPCError with a readable message
  return error instanceof ORPCError ? error.message : fallback;
}

/**
 * Check for an oRPC error with a specific HTTP status, such as a 401 for an expired session.
 *
 * @param error - The value thrown by an oRPC call.
 * @param status - The HTTP status to look for.
 * @returns Whether the error carries that status.
 */
export function hasStatus(error: unknown, status: number): boolean {
  return error instanceof ORPCError && error.status === status;
}
