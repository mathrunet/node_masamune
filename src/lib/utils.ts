import {randomUUID} from "crypto";

/**
 * Checks if [value] is {[key: string]: any}.
 * 
 * [value]が{[key: string]: any}であるかどうかをチェックします。
 * 
 * @param value 
 * Value to be checked.
 * 
 * チェックしたい値。
 * 
 * @returns 
 * If [value] is {[key: string]: any}, returns true; otherwise, returns false.
 * 
 * [value]が{[key: string]: any}ならtrue、そうでなければfalseを返します。
 */
export function isDynamicMap(value: any): value is {[key: string]: any} {
  return value !== null && typeof value === 'object' && !(value instanceof Array);
}

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

/**
 * Divides an array into pieces of the specified size.
 * 
 * 配列を指定したサイズで分割します。
 * 
 * @param array
 * Array to be divided.
 * 
 * 分割したい配列。
 * 
 * @param chunkSize
 * Size of each piece.
 * 
 * 1つのピースのサイズ。
 * 
 * @returns {T[][]}
 * Array divided into pieces.
 * 
 * 分割された配列。
 */
export function splitArray<T>(array: T[], chunkSize: number): T[][] {
    let index = 0;
    let arrayLength = array.length;
    let tempArray = [];
    
    for (index = 0; index < arrayLength; index += chunkSize) {
        let chunk = array.slice(index, index+chunkSize);
        tempArray.push(chunk);
    }

    return tempArray;
}