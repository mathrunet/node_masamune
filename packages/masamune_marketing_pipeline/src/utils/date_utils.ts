import {
    format,
    subDays,
    subWeeks,
    subMonths,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    differenceInDays,
    differenceInMonths,
    parseISO,
    isAfter,
    isBefore,
} from "date-fns";
import { DateRange } from "../models/marketing_data";
import { ReportSchedule } from "../models/app_config";

/**
 * Date format constants.
 */
export const DATE_FORMAT = "yyyy-MM-dd";
export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

/**
 * Format a date to YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
    return format(date, DATE_FORMAT);
}

/**
 * Format a date to full datetime string.
 */
export function formatDateTime(date: Date): string {
    return format(date, DATETIME_FORMAT);
}

/**
 * Get the date range for a report based on schedule type.
 * レポートのスケジュールタイプに基づいて日付範囲を取得。
 *
 * @param schedule - Report schedule type
 * @param referenceDate - Reference date (defaults to now)
 * @returns Date range for the report
 */
export function getReportDateRange(
    schedule: ReportSchedule,
    referenceDate: Date = new Date()
): DateRange {
    const endDate = endOfDay(subDays(referenceDate, 1)); // Yesterday

    let startDate: Date;

    switch (schedule) {
        case "daily":
            startDate = startOfDay(subDays(referenceDate, 1)); // Yesterday
            break;
        case "weekly":
            startDate = startOfDay(subWeeks(referenceDate, 1)); // 7 days ago
            break;
        case "monthly":
            startDate = startOfDay(subMonths(referenceDate, 1)); // 1 month ago
            break;
        default:
            startDate = startOfDay(subDays(referenceDate, 1));
    }

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
    };
}

/**
 * Check if a report is due based on schedule and last generation time.
 * スケジュールと最終生成時刻に基づいてレポートが必要かどうかを確認。
 *
 * @param schedule - Report schedule type
 * @param lastGeneratedAt - Last report generation timestamp
 * @param referenceDate - Reference date (defaults to now)
 * @returns True if report should be generated
 */
export function isReportDue(
    schedule: ReportSchedule,
    lastGeneratedAt: Date | null | undefined,
    referenceDate: Date = new Date()
): boolean {
    if (!lastGeneratedAt) {
        return true; // Never generated, so it's due
    }

    const daysSinceLastReport = differenceInDays(referenceDate, lastGeneratedAt);
    const monthsSinceLastReport = differenceInMonths(referenceDate, lastGeneratedAt);

    switch (schedule) {
        case "daily":
            return daysSinceLastReport >= 1;
        case "weekly":
            return daysSinceLastReport >= 7;
        case "monthly":
            return monthsSinceLastReport >= 1 || daysSinceLastReport >= 28;
        default:
            return false;
    }
}

/**
 * Calculate the next report due date.
 * 次のレポート期限を計算。
 *
 * @param schedule - Report schedule type
 * @param lastGeneratedAt - Last report generation timestamp
 * @returns Next due date
 */
export function getNextReportDueDate(
    schedule: ReportSchedule,
    lastGeneratedAt: Date = new Date()
): Date {
    switch (schedule) {
        case "daily":
            return startOfDay(subDays(lastGeneratedAt, -1)); // Tomorrow
        case "weekly":
            return startOfDay(subWeeks(lastGeneratedAt, -1)); // Next week
        case "monthly":
            return startOfDay(subMonths(lastGeneratedAt, -1)); // Next month
        default:
            return startOfDay(subDays(lastGeneratedAt, -1));
    }
}

/**
 * Parse a date string in YYYY-MM-DD format.
 */
export function parseDateString(dateString: string): Date {
    return parseISO(dateString);
}

/**
 * Check if a date is within a date range.
 */
export function isWithinRange(date: Date, range: DateRange): boolean {
    const start = parseISO(range.startDate);
    const end = parseISO(range.endDate);
    return !isBefore(date, start) && !isAfter(date, end);
}

/**
 * Get previous period date range for comparison.
 * 比較用の前期間の日付範囲を取得。
 */
export function getPreviousPeriodRange(currentRange: DateRange): DateRange {
    const start = parseISO(currentRange.startDate);
    const end = parseISO(currentRange.endDate);
    const periodDays = differenceInDays(end, start) + 1;

    const prevEnd = subDays(start, 1);
    const prevStart = subDays(prevEnd, periodDays - 1);

    return {
        startDate: formatDate(prevStart),
        endDate: formatDate(prevEnd),
    };
}
