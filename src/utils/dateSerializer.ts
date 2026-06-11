export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toIsoDateUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

export function fromIsoDateUTC(iso: string): Date {
  // expects YYYY-MM-DD
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(Date.UTC(year, month, day));
}

export function toExcelSerialUTC(date: Date): number {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return utc / 86_400_000 + 25569;
}
