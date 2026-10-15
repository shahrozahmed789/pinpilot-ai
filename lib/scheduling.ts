import 'server-only';

export type PostingSlot = { scheduledAt: string; localLabel: string };
function partsAt(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(values.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)])) as Record<string, number>;
}
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = partsAt(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = target - represented;
    guess += delta;
    if (!delta) break;
  }
  return new Date(guess);
}
function dailyTimes(count: number, earliest = 8 * 60 + 15, latest = 13 * 60 + 15) {
  if (count === 1) return [12 * 60];
  return Array.from({ length: count }, (_, i) => Math.round((earliest + (latest - earliest) * i / (count - 1)) / 5) * 5);
}
/** Return future publication instants from local wall-clock slots; DST is handled by the IANA timezone. */
export function getUpcomingPostingSlots(timezone: string, count: number, from = new Date()): PostingSlot[] {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(from);
  const start = partsAt(from, timezone);
  const result: PostingSlot[] = [];
  for (let offset = 0; offset < 15 && result.length < count; offset++) {
    const base = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    for (const minutes of dailyTimes(count)) {
      const instant = localToUtc(y, m, d, Math.floor(minutes / 60), minutes % 60, timezone);
      if (instant.getTime() <= from.getTime() + 2 * 60_000) continue;
      result.push({ scheduledAt: instant.toISOString(), localLabel: new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(instant) });
      if (result.length >= count) break;
    }
  }
  if (result.length !== count) throw new Error('Could not create the requested posting slots for this time zone.');
  return result;
}
