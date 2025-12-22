/**
 * Locale Resolution Module
 *
 * Provides functions to get translations and font families based on locale.
 */

import { MarketingTranslations, SupportedLocale, FontFamily } from "./types";
import { en } from "./en";
import { ja } from "./ja";
import { zh_CN } from "./zh_CN";
import { ko_KR } from "./ko_KR";
import { es_ES } from "./es_ES";
import { fr_FR } from "./fr_FR";
import { de_DE } from "./de_DE";
import { pt_PT } from "./pt_PT";
import { ru_RU } from "./ru_RU";
import { id_ID } from "./id_ID";

/**
 * ModelLocale type from masamune_workflow.
 */
interface ModelLocale {
    "@language": string;
}

/**
 * Translation map by locale code.
 */
const translations: Record<SupportedLocale, MarketingTranslations> = {
    en,
    ja,
    zh_CN,
    ko_KR,
    es_ES,
    fr_FR,
    de_DE,
    pt_PT,
    ru_RU,
    id_ID,
};

/**
 * Supported locale codes.
 */
export const SUPPORTED_LOCALES: SupportedLocale[] = [
    "en",
    "ja",
    "zh_CN",
    "ko_KR",
    "es_ES",
    "fr_FR",
    "de_DE",
    "pt_PT",
    "ru_RU",
    "id_ID",
];

/**
 * Extract language code from locale.
 *
 * @param locale - Locale string or ModelLocale object
 * @returns Language code (e.g., "en", "ja", "zh")
 */
export function extractLanguageCode(locale?: ModelLocale | string): string {
    if (!locale) return "en";

    // ModelLocale type: { "@language": "ja_JP" }
    if (typeof locale === "object" && "@language" in locale) {
        return locale["@language"].split("_")[0];
    }

    // String format: "ja_JP" or "ja"
    return locale.split("_")[0];
}

/**
 * Normalize locale string to supported locale code.
 *
 * @param locale - Locale string or ModelLocale object
 * @returns Normalized SupportedLocale code
 */
export function normalizeLocale(locale?: ModelLocale | string): SupportedLocale {
    if (!locale) return "en";

    let localeStr: string;

    // ModelLocale type: { "@language": "ja_JP" }
    if (typeof locale === "object" && "@language" in locale) {
        localeStr = locale["@language"];
    } else {
        localeStr = locale;
    }

    // Exact match first
    if (SUPPORTED_LOCALES.includes(localeStr as SupportedLocale)) {
        return localeStr as SupportedLocale;
    }

    // Language code match (e.g., "ja" -> "ja", "zh" -> "zh_CN")
    const lang = localeStr.split("_")[0];

    // Direct match for simple codes
    if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
        return lang as SupportedLocale;
    }

    // Find matching locale by language prefix
    for (const supported of SUPPORTED_LOCALES) {
        if (supported.startsWith(lang)) {
            return supported;
        }
    }

    // Default to English
    return "en";
}

/**
 * Get translations for a locale.
 *
 * @param locale - Locale string or ModelLocale object
 * @returns MarketingTranslations for the locale
 */
export function getTranslations(locale?: ModelLocale | string): MarketingTranslations {
    const normalizedLocale = normalizeLocale(locale);
    return translations[normalizedLocale];
}

/**
 * Get font family for a locale.
 *
 * CJK languages require specific fonts:
 * - Japanese (ja): NotoSansJP
 * - Chinese (zh): NotoSansSC
 * - Korean (ko): NotoSansKR
 * - Russian (ru): NotoSans (for Cyrillic)
 * - Latin languages: Helvetica
 *
 * @param locale - Locale string or ModelLocale object
 * @returns FontFamily to use for PDF generation
 */
export function getFontFamily(locale?: ModelLocale | string): FontFamily {
    const lang = extractLanguageCode(locale);

    switch (lang) {
        case "ja":
            return "NotoSansJP";
        case "zh":
            return "NotoSansSC";
        case "ko":
            return "NotoSansKR";
        case "ru":
            return "NotoSans";
        // Latin languages (en, es, fr, de, pt, id) use Helvetica
        default:
            return "Helvetica";
    }
}

/**
 * Check if a locale requires CJK font.
 *
 * @param locale - Locale string or ModelLocale object
 * @returns true if CJK font is required
 */
export function requiresCjkFont(locale?: ModelLocale | string): boolean {
    const fontFamily = getFontFamily(locale);
    return fontFamily !== "Helvetica";
}

// Re-export types
export { MarketingTranslations, SupportedLocale, FontFamily } from "./types";
