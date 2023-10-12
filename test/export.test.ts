import "../src/index"

describe("Export test", () => {
    test("Test sample", () => {
        expect("abcd".toZenkakuNumericAndAlphabet()).toBe("ａｂｃｄ");
        expect("ａｂｃｄ".toHankakuNumericAndAlphabet()).toBe("abcd");
        expect("アイウエオ".toHiragana()).toBe("あいうえお");
        expect("あいうえお".toKatakana()).toBe("アイウエオ");
        expect("ｱｲｳｴｵ".toZenkakuKatakana()).toBe("アイウエオ");
        expect("abcde".splitByCharacter()).toEqual(["a", "b", "c", "d", "e"]);
        expect("abcde".splitByBigram()).toEqual(["ab", "bc", "cd", "de"]);
        expect("abcde".splitByCharacterAndBigram()).toEqual(["a", "b", "c", "d", "e", "ab", "bc", "cd", "de"]);
        expect("abcde".splitByTrigram()).toEqual(["abc", "bcd", "cde"]);
    });
});