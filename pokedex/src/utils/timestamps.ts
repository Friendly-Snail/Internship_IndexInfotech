/**
 * Convert a stored Date to whole Unix seconds since 1970-01-01T00:00:00Z.
 *
 * @param date - The saved instant to convert.
 * @returns Seconds since the Unix epoch; fractional seconds are rounded down.
 * @throws RangeError if the Date is invalid.
 */
export function toUnixSeconds(date: Date): number {
  // getTime returns epoch milliseconds; getUTCSeconds only returns the clock's seconds component
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Cannot convert an invalid Date to Unix seconds");
  }
  return Math.floor(milliseconds / 1000);
}
