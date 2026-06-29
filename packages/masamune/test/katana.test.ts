import { utils } from "@mathrunet/masamune";

describe("Masamune Test", () => {
    test("Split Array", () => {
        const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(utils.splitArray(testData, 3)).toStrictEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
        expect(utils.splitArray(testData, 4)).toStrictEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
    });
    test("Change text test", () => {
        expect("abcd".toZenkakuNumericAndAlphabet()).toBe("ａｂｃｄ");
        expect("ａｂｃｄ".toHankakuNumericAndAlphabet()).toBe("abcd");
        expect("アイウエオ".toHiragana()).toBe("あいうえお");
        expect("あいうえお".toKatakana()).toBe("アイウエオ");
        expect("ｱｲｳｴｵ".toZenkakuKatakana()).toBe("アイウエオ");
        expect("abcde".splitByCharacter()).toEqual(["a", "b", "c", "d", "e"]);
        expect("abcde".splitByBigram()).toEqual(["ab", "bc", "cd", "de"]);
        expect("abcde".splitByCharacterAndBigram()).toEqual(["a", "b", "c", "d", "e", "ab", "bc", "cd", "de"]);
        expect("abcde".splitByTrigram()).toEqual(["abc", "bcd", "cde"]);
        expect("😊😆".removeOnlyEmoji()).toBe("");
        // FirestoreのMapキーテスト
        expect("test.key".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("test/key".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("test~key".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("test*key".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("test[key]".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("test./*~[]key".toNoSQLDatabaseMapKey()).toBe("testkey");
        expect("  test key  ".toNoSQLDatabaseMapKey()).toBe("test key");
        expect("normal_key-123".toNoSQLDatabaseMapKey()).toBe("normal_key-123");
    });
});
