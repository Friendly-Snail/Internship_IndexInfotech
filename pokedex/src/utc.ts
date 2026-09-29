// format the same calendar day for every client, no matter where the server runs
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
