import { format, fromUnixTime, getUnixTime, isValid, startOfSecond } from "date-fns";

/**
 * Convert a stored Date to whole Unix seconds since 1970-01-01T00:00:00Z.
 *
 * @param date - The saved instant to convert.
 * @returns Seconds since the Unix epoch; fractional seconds are rounded down.
 * @throws RangeError if the Date is invalid.
 */
export function toUnixSeconds(date: Date): number {
  if (!isValid(date)) {
    throw new RangeError("Cannot convert an invalid Date to Unix seconds");
  }
  // startOfSecond preserves rounding down even for dates before the Unix epoch
  // getUnixTime returns epoch seconds, unlike getSeconds which returns only 0–59
  return getUnixTime(startOfSecond(date));
}

/**
 * Display whole Unix seconds as a readable calendar date in the runtime's local timezone.
 *
 * @param seconds - An API Unix timestamp in seconds, not JavaScript milliseconds.
 * @returns A date such as 2026-10-09; the browser uses the viewer's local timezone.
 * @throws RangeError if the timestamp is not a safe integer or is outside the Date range.
 */
export function formatUnixDate(seconds: number): string {
  if (!Number.isSafeInteger(seconds)) {
    throw new RangeError("Unix seconds must be a safe integer");
  }
  const date = fromUnixTime(seconds);
  if (!isValid(date)) {
    throw new RangeError("Cannot display a timestamp outside the supported Date range");
  }
  return format(date, "yyyy-MM-dd");
}
