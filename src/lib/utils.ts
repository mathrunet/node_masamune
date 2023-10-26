import {randomUUID} from "crypto";

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
 * Generates a UUIDv4.
 * 
 * UUIDv4を生成します。
 * 
 * @return {string}
 * UUIDv4.
 */
export function uuid() {
  return randomUUID().replace(/-/g, "");
}