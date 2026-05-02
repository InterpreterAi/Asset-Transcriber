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

/** Current calendar date (`YYYY-MM-DD`) and clock hour (0–23) in the app timezone. */
export function appCalendarDateAndHour(ref: Date = new Date()): { dateIso: string; hour: number } {
  const dt = DateTime.fromJSDate(ref).setZone(APP_TIME_ZONE);
  return { dateIso: dt.toISODate()!, hour: dt.hour };
}
