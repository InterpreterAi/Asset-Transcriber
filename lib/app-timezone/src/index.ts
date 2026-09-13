import { DateTime } from "luxon";

/** Product “calendar day” for daily limits, admin stats, and session rollups (US Eastern). */
export const APP_TIME_ZONE = "America/New_York";

/** UTC `Date` for midnight at the start of the app-calendar day containing `ref`. */
export function startOfAppDay(ref: Date = new Date()): Date {
  return DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE).startOf("day").toUTC().toJSDate();
}

/** True if `since` and `ref` fall on different calendar dates in the app timezone. */
export function appCalendarDayChanged(since: Date, ref: Date = new Date()): boolean {
  const a = DateTime.fromJSDate(since).setZone(APP_TIME_ZONE).toISODate();
  const b = DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE).toISODate();
  return a !== b;
}

export function startOfAppMonth(ref: Date = new Date()): Date {
  return DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE).startOf("month").toUTC().toJSDate();
}

/** `YYYY-MM` for the app-calendar month containing `ref`. */
export function appYearMonthContaining(ref: Date = new Date()): string {
  return DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE).toFormat("yyyy-MM");
}

/** UTC range for an app-calendar month (`YYYY-MM`). `endExclusive` is the first instant of the next month. */
export function appMonthRangeUtc(yearMonth: string): { start: Date; endExclusive: Date } | null {
  const startDt = DateTime.fromFormat(yearMonth.trim(), "yyyy-MM", { zone: APP_TIME_ZONE });
  if (!startDt.isValid) return null;
  return {
    start: startDt.startOf("month").toUTC().toJSDate(),
    endExclusive: startDt.startOf("month").plus({ months: 1 }).toUTC().toJSDate(),
  };
}

/** UTC midnight of the app-calendar day for `YYYY-MM-DD`. */
export function startOfAppDayFromIsoDate(isoDate: string): Date | null {
  const dt = DateTime.fromISO(isoDate.trim(), { zone: APP_TIME_ZONE });
  if (!dt.isValid) return null;
  return dt.startOf("day").toUTC().toJSDate();
}

/** First instant of the calendar day `daysAgo` days before the app-calendar day of `ref`. */
export function startOfAppDayMinusDays(ref: Date, daysAgo: number): Date {
  return DateTime.fromJSDate(ref)
    .setZone(APP_TIME_ZONE)
    .startOf("day")
    .minus({ days: daysAgo })
    .toUTC()
    .toJSDate();
}

/** Milliseconds since epoch for midnight (app TZ) of the calendar day containing `ref` — for client filters. */
export function startOfAppDayMs(ref: Date = new Date()): number {
  return startOfAppDay(ref).getTime();
}

/** `YYYY-MM-DD` in the app timezone for the calendar day `daysAgo` before the app-calendar day of `ref`. */
export function appCalendarDayIsoKeyForDaysAgo(ref: Date, daysAgo: number): string {
  return DateTime.fromJSDate(ref)
    .setZone(APP_TIME_ZONE)
    .startOf("day")
    .minus({ days: daysAgo })
    .toISODate()!;
}

/** `YYYY-MM-DD` (app TZ) for the calendar day containing instant `ref`. */
export function appCalendarIsoDateContaining(ref: Date): string {
  return DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE).toISODate()!;
}

/** Inclusive app-calendar day count from `start`'s day through `end`'s day. No 370-day cap. */
export function countAppCalendarDaysInclusive(start: Date, end: Date): number {
  const d0 = DateTime.fromJSDate(start).setZone(APP_TIME_ZONE).startOf("day");
  const endD = DateTime.fromJSDate(end).setZone(APP_TIME_ZONE).startOf("day");
  if (!d0.isValid || !endD.isValid || d0 > endD) return 0;
  return Math.floor(endD.diff(d0, "days").days) + 1;
}

/** Each app-calendar `YYYY-MM-DD` from the start of `start`'s day through the start of `end`'s day (inclusive). */
export function iterateAppCalendarIsoDatesInclusive(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const d0 = DateTime.fromJSDate(start).setZone(APP_TIME_ZONE).startOf("day");
  const endD = DateTime.fromJSDate(end).setZone(APP_TIME_ZONE).startOf("day");
  if (!d0.isValid || !endD.isValid) return keys;
  let cursor = d0;
  let guard = 0;
  while (cursor <= endD && guard < 370) {
    keys.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
    guard += 1;
  }
  return keys;
}

/** Start of the app-calendar day containing `ref`, advanced by `plusDays` (may be negative). */
export function appCalendarStartOfDayPlusDays(ref: Date, plusDays: number): Date {
  return DateTime.fromJSDate(ref)
    .setZone(APP_TIME_ZONE)
    .startOf("day")
    .plus({ days: plusDays })
    .toUTC()
    .toJSDate();
}

/**
 * Count Mon–Fri in {@link APP_TIME_ZONE} from the start of `startRef`'s calendar day through the start of `endRef`'s day (inclusive).
 * If `startRef`'s day is after `endRef`'s day, returns 0.
 */
export function countAppTimezoneWeekdaysInclusive(startRef: Date, endRef: Date): number {
  const d0 = DateTime.fromJSDate(startRef).setZone(APP_TIME_ZONE).startOf("day");
  const endD = DateTime.fromJSDate(endRef).setZone(APP_TIME_ZONE).startOf("day");
  if (!d0.isValid || !endD.isValid || d0 > endD) return 0;
  let n = 0;
  let cursor = d0;
  let guard = 0;
  while (cursor <= endD && guard++ < 400) {
    const w = cursor.weekday;
    if (w >= 1 && w <= 5) n += 1;
    cursor = cursor.plus({ days: 1 });
  }
  return n;
}

/** Current calendar date (`YYYY-MM-DD`) and clock hour (0–23) in the app timezone. */
export function appCalendarDateAndHour(ref: Date = new Date()): { dateIso: string; hour: number } {
  const dt = DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE);
  return { dateIso: dt.toISODate()!, hour: dt.hour };
}
