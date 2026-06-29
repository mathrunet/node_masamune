/**
 * Common data types shared across multiple modules.
 *
 * 複数モジュールで共有される共通データ型。
 */

/**
 * Date range for data collection.
 *
 * データ収集の日付範囲。
 */
export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
}

/**
 * Rating distribution across star levels.
 *
 * 星評価別の分布。
 */
export interface RatingDistribution {
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
}

/**
 * Normalized review data (shared across platforms).
 *
 * プラットフォーム間で共有される正規化されたレビューデータ。
 */
export interface Review {
    id: string;
    rating: number;
    title?: string;
    text: string;
    authorName?: string;
    date: string;
    language?: string;
    replyText?: string;
    replyDate?: string;
}
