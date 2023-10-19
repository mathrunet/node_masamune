import "../src/index"
import { Api } from "../src/index";

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
    test("Api get test", async () => {
        const res = await Api.get("http://demo4960528.mockable.io/get");
        const json = await res.json();
        expect(json).toEqual({ "success": true });
    });
    test("Api post test", async () => {
        const res = await Api.post("http://demo4960528.mockable.io/post", {
            data: {
                "request": "test"
            }
        });
        const json = await res.json();
        expect(json).toEqual({ "success": true });
    });
});
    test("Api put test", async () => {
        const res = await Api.put("http://demo4960528.mockable.io/put", {
            data: {
                "request": "test"
            }
        });
        const json = await res.json();
        expect(json).toEqual({ "success": true });
    });
    test("Api delete test", async () => {
        const res = await Api.delete("http://demo4960528.mockable.io/delete");
        const json = await res.json();
        expect(json).toEqual({ "success": true });
    });
