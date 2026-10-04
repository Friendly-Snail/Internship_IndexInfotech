// format the same calendar day for every client, no matter where the server runs
/**
 * Format a Date as the same UTC calendar day for every client.
 *
 * @param date - The date to format.
 * @returns The date in YYYY-MM-DD format.
 * @throws If the Date is invalid.
 */
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

///TODO just use Unix timestamp instead of UTC
