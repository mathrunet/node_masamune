import * as crypto from "crypto";
export { };

declare global {
    interface String {
        /**
         * Encrypts a string.
         * 文字列を暗号化します。
         *
         * @param {string} key
         * Encryption key #1. (32 bytes)
         * 暗号化キー1。(32バイト)
         *
         * @param {string} ivKey
         * Encryption key 2. (16 bytes)
         * 暗号化キー2。(16バイト)
         *
         * @return {string}
         * Encrypted string.
         * 暗号化された文字列。
         */
        encrypt({
            key,
            ivKey
            }: {
            key: string,
            ivKey: string
            }): string;
        
        /**
         * Decrypts a string.
         * 文字列を復号化します。
         *
         * @param {string} key
         * Encryption key #1. (32 bytes)
         * 暗号化キー1。(32バイト)
         * @param {string} ivKey
         * Encryption key 2. (16 bytes)
         * 暗号化キー2。(16バイト)
         *
         * @return {string}
         * Decrypted string.
         * 復号化された文字列。
         */
        decrypt({
            key,
            ivKey,
            }: {
            key: string,
            ivKey: string,
            }): string;
        
        /**
         * Converts alphabets and numbers to full-width characters.
         * 
         * アルファベットと数字を全角に変換します。
         * 
         * ```typescript
         * const text = "abcd";
         * const converted = text.toZenkakuNumericAndAlphabet(); // "ａｂｃｄ"
         * ```
         * 
         * @return {string}
         * Full-width string.
         * 全角に変換された文字列。
         */
        toZenkakuNumericAndAlphabet(): string;

        /**
         * Converts alphabets and numbers to half-width characters.
         * 
         * アルファベットと数字を半角に変換します。
         * 
         * ```typescript
         * const text = "ａｂｃｄ";
         * const converted = text.toHankakuNumericAndAlphabet(); // "abcd"
         * ```
         * 
         * @return {string}
         * Half-width string.
         * 半角に変換された文字列。
         */
        toHankakuNumericAndAlphabet(): string;

        /**
         * Converts katakana to hiragana.
         * 
         * カタカナをひらがなに変換します。
         * 
         * ```typescript
         * const text = "アイウエオ";
         * const converted = text.toHiragana(); // "あいうえお"
         * ```
         * 
         * @return {string}
         * Hiragana string.
         * ひらがなに変換された文字列。
         */
        toHiragana(): string;

        /**
         * Converts hiragana into katakana.
         * 
         * ひらがなをカタカナに変換します。
         * 
         * ```typescript
         * const text = "あいうえお";
         * const converted = text.toKatakana(); // "アイウエオ"
         * ```
         * 
         * @return {string}
         * Katakana string.
         * カタカナに変換された文字列。
         */
        toKatakana(): string;

        /**
         * Converts half-width katakana to full-width katakana.
         * 
         * 半角カタカナを全角カタカナに変換します。
         * 
         * ```typescript
         * const text = "ｱｲｳｴｵ";
         * const converted = text.toZenkakuKatakana(); // "アイウエオ"
         * ```
         * 
         * @return {string}
         * Full-width katakana string.
         * 全角カタカナに変換された文字列。
         */
        toZenkakuKatakana(): string;

        /**
         * Converts [String] to an array of one character at a time.
         * 
         * [String]を1文字ずつの配列に変換します。
         * 
         * ```typescript
         * const text = "abcde";
         * const characters = text.splitByCharacter(); // ["a", "b", "c", "d", "e"];
         * ```
         * 
         * @return {string[]}
         * Array of one character at a time.
         * 1文字ずつの配列。
         */
        splitByCharacter(): string[];

        /**
         * Convert [String] to Bigram, i.e., an array of two characters each.
         * 
         * [String]をBigram、つまり2文字ずつの配列に変換します。
         * 
         * ```typescript
         * const text = "abcde";
         * const characters = text.splitByBigram(); // ["ab", "bc", "cd", "de"];
         * ```
         * 
         * @return {string[]}
         * Array of two characters at a time.
         * 2文字ずつの配列。
         */
        splitByBigram(): string[];

        /**
         * Converts [String] into a one-character array and a two-character array.
         * 
         * [String]を1文字ずつの配列と2文字ずつの配列に変換します。
         * 
         * ```typescript
         * const text = "abcde";
         * const characters = text.splitByCharacterAndBigram(); // ["a", "b", "c", "d", "e", "ab", "bc", "cd", "de"];
         * ```
         * 
         * @return {string[]}
         * Array of one character at a time and two characters at a time.
         * 1文字ずつと2文字ずつの配列。
         */
        splitByCharacterAndBigram(): string[];

        /**
         * Convert [String] to Trigram, i.e., an array of 3 characters each.
         * 
         * [String]をTrigram、つまり3文字ずつの配列に変換します。
         * 
         * ```typescript
         * const text = "abcde";
         * const characters = text.splitByTrigram(); // ["abc", "bcd", "cde"];
         * ```
         * 
         * @return {string[]}
         * Array of three characters at a time.
         * 3文字ずつの配列。
         */
        splitByTrigram(): string[];
    }
}

String.prototype.encrypt = function ({
    key,
    ivKey
}: {
    key: string,
    ivKey: string
}) {
    const raw = (this as String).valueOf();
    const iv = Buffer.from(ivKey);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
    let encrypted = cipher.update(raw);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString("hex");
};

String.prototype.decrypt = function ({
    key,
    ivKey
}: {
    key: string,
    ivKey: string
}) {
    const encrypted = (this as String).valueOf();
    const iv = Buffer.from(ivKey);
    const encryptedText = Buffer.from(encrypted, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};

String.prototype.toZenkakuNumericAndAlphabet = function () {
    return (this as String).valueOf().replace(/[A-Za-z0-9]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) + 65248);
    });
};

String.prototype.toHankakuNumericAndAlphabet = function () {
    return (this as String).valueOf().replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
    });
};

String.prototype.toHiragana = function () {
    return (this as String).valueOf().replace(/[\u30a1-\u30f6]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0x60);
    });
};

String.prototype.toKatakana = function () {
    return (this as String).valueOf().replace(/[\u3041-\u3096]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) + 0x60);
    });
};

String.prototype.toZenkakuKatakana = function () {
    let text = (this as String).valueOf();
    text = text.replace(/[ｳｶ-ﾄﾊ-ﾎ]ﾞ/g, (s) => {
        const dakuten: { [key: string]: string } = {
            'ｳﾞ': 'ヴ',
            'ｶﾞ': 'ガ',
            'ｷﾞ': 'ギ',
            'ｸﾞ': 'グ',
            'ｹﾞ': 'ゲ',
            'ｺﾞ': 'ゴ',
            'ｻﾞ': 'ザ',
            'ｼﾞ': 'ジ',
            'ｽﾞ': 'ズ',
            'ｾﾞ': 'ゼ',
            'ｿﾞ': 'ゾ',
            'ﾀﾞ': 'ダ',
            'ﾁﾞ': 'ヂ',
            'ﾂﾞ': 'ヅ',
            'ﾃﾞ': 'デ',
            'ﾄﾞ': 'ド',
            'ﾊﾞ': 'バ',
            'ﾋﾞ': 'ビ',
            'ﾌﾞ': 'ブ',
            'ﾍﾞ': 'ベ',
            'ﾎﾞ': 'ボ',
        };
        return dakuten[s] ?? s;
    });
    text = text.replace(/[ﾊ-ﾎ]ﾟ/g, (s) => {
        const handakuten: { [key: string]: string } = {
        'ﾊﾟ': 'パ',
        'ﾋﾟ': 'ピ',
        'ﾌﾟ': 'プ',
        'ﾍﾟ': 'ペ',
        'ﾎﾟ': 'ポ',
        };
        return handakuten[s] ?? s;
    });
    text = text.replace(/[ｦ-ﾝｰ]/g, (s) => {
        const other: { [key: string]: string } = {
            'ｱ': 'ア',
            'ｲ': 'イ',
            'ｳ': 'ウ',
            'ｴ': 'エ',
            'ｵ': 'オ',
            'ｧ': 'ァ',
            'ｨ': 'ィ',
            'ｩ': 'ゥ',
            'ｪ': 'ェ',
            'ｫ': 'ォ',
            'ｶ': 'カ',
            'ｷ': 'キ',
            'ｸ': 'ク',
            'ｹ': 'ケ',
            'ｺ': 'コ',
            'ｻ': 'サ',
            'ｼ': 'シ',
            'ｽ': 'ス',
            'ｾ': 'セ',
            'ｿ': 'ソ',
            'ﾀ': 'タ',
            'ﾁ': 'チ',
            'ﾂ': 'ツ',
            'ﾃ': 'テ',
            'ﾄ': 'ト',
            'ﾅ': 'ナ',
            'ﾆ': 'ニ',
            'ﾇ': 'ヌ',
            'ﾈ': 'ネ',
            'ﾉ': 'ノ',
            'ﾊ': 'ハ',
            'ﾋ': 'ヒ',
            'ﾌ': 'フ',
            'ﾍ': 'ヘ',
            'ﾎ': 'ホ',
            'ﾏ': 'マ',
            'ﾐ': 'ミ',
            'ﾑ': 'ム',
            'ﾒ': 'メ',
            'ﾓ': 'モ',
            'ﾔ': 'ヤ',
            'ﾕ': 'ユ',
            'ﾖ': 'ヨ',
            'ﾗ': 'ラ',
            'ﾘ': 'リ',
            'ﾙ': 'ル',
            'ﾚ': 'レ',
            'ﾛ': 'ロ',
            'ﾜ': 'ワ',
            'ｦ': 'ヲ',
            'ﾝ': 'ン',
            'ｯ': 'ッ',
            'ｬ': 'ャ',
            'ｭ': 'ュ',
            'ｮ': 'ョ',
            'ｰ': 'ー',
        };
        return other[s] ?? s;
    });
    return text;
};

String.prototype.splitByCharacter = function () {
    return (this as String).valueOf().split("");
};

String.prototype.splitByBigram = function () {
    const text = (this as String).valueOf();
    const result: string[] = [];
    for (let i = 0; i < text.length - 1; i++) {
        result.push(text.substring(i, Math.min(i + 2, text.length)));
    }
    return result;
};

String.prototype.splitByCharacterAndBigram = function () {
    return [...this.splitByCharacter(), ...this.splitByBigram()];
};

String.prototype.splitByTrigram = function () {
    const text = (this as String).valueOf();
    const result: string[] = [];
    for (let i = 0; i < text.length - 2; i++) {
        result.push(text.substring(i, Math.min(i + 3, text.length)));
    }
    return result;
};
