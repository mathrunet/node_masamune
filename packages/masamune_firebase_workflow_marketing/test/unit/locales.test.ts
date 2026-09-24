import {
    extractLanguageCode,
    getFontFamily,
    getTranslations,
    normalizeLocale,
} from "../../src/locales";

describe("Marketing locale selection", () => {
    it("normalizes locale strings and model locale values", () => {
        expect(normalizeLocale("zh_TW")).toBe("zh_CN");
        expect(normalizeLocale({ "@language": "ja_JP" })).toBe("ja");
        expect(normalizeLocale("unsupported")).toBe("en");
        expect(extractLanguageCode({ "@language": "ko_KR" })).toBe("ko");
    });

    it("selects CJK fonts and falls back to English translations", () => {
        expect(getFontFamily("ja_JP")).toBe("NotoSansJP");
        expect(getFontFamily("en_US")).toBe("Helvetica");
        expect(getTranslations("unsupported")).toBe(getTranslations("en"));
    });
});
