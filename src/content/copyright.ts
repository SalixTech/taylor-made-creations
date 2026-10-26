/** Copyright rolls forward at 12:01 a.m. Eastern on January 1, not midnight. */
export const COPYRIGHT_START_YEAR = 2023;
export const COPYRIGHT_TIME_ZONE = "America/New_York";
const easternClock = new Intl.DateTimeFormat("en-US", {
  timeZone: COPYRIGHT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function easternParts(time: number) {
  const parts = easternClock.formatToParts(time);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: number("year"), month: number("month"), day: number("day"), hour: number("hour"), minute: number("minute"), second: number("second") };
}
/** Resolve local January 1 00:01 through the timezone database, without relying on the server/browser timezone. */
export function copyrightRolloverAt(year: number): number {
  const localTarget = Date.UTC(year, 0, 1, 0, 1, 0);
  let instant = localTarget;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = easternParts(instant);
    const difference = localTarget - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    instant += difference;
    if (difference === 0) break;
  }
  return instant;
}
export function copyrightYearAt(now: number | Date = Date.now()): number {
  const instant = Number(now);
  const year = easternParts(instant).year;
  return instant < copyrightRolloverAt(year) ? year - 1 : year;
}
export function nextCopyrightRolloverAt(now: number | Date = Date.now()): number {
  return copyrightRolloverAt(copyrightYearAt(now) + 1);
}
/** Browsers clamp setTimeout beyond signed 32-bit milliseconds; reschedule long waits safely. */
export function copyrightRefreshDelay(now: number | Date = Date.now()): number {
  return Math.min(2_147_000_000, Math.max(1, nextCopyrightRolloverAt(now) - Number(now)));
}
