import * as crypto from "crypto";

/**
 * Converts strings, numbers, etc. to the appropriate type.
 *
 * 文字列や数値などを適切な型に変換します。
 *
 * @param {string | number} value
 * Strings and numbers.
 * 文字列か数値。
 *
 * @return {bool | number | string}
 * If it is a string, a numeric value is returned;
 * otherwise, the input value is returned.
 * 文字列なら数値、そうでなければ入力値が返却されます。
 */
export function parse(value: string | number) {
  if (typeof value === "string") {
    if (value === "false") {
      return false;
    } else if (value === "true") {
      return true;
    } else if (value.match(new RegExp("^[0-9]+$"))) {
      const i = parseInt(value);
      if (isNaN(i)) {
        return value;
      } else {
        return i;
      }
    } else {
      return value;
    }
  } else {
    return value;
  }
}

/**
 * Encrypts a string.
 * 文字列を暗号化します。
 *
 * @param {string} raw
 * The string to encrypt.
 * 暗号化する文字列。
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
export function encrypt({
  raw,
  key,
  ivKey
}: {
  raw: string,
  key: string,
  ivKey: string
}) {
  const iv = Buffer.from(ivKey);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
  let encrypted = cipher.update(raw);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString("hex");
}

/**
 * Decrypts a string.
 * 文字列を復号化します。
 *
 * @param {string} encrypted
 * The string to encrypted.
 * 暗号化された文字列。
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
export function decrypt({
  encrypted,
  key,
  ivKey,
}: {
  encrypted: string,
  key: string,
  ivKey: string,
}) {
  const iv = Buffer.from(ivKey);
  const encryptedText = Buffer.from(encrypted, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
