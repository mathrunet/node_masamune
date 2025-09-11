import { v7 as uuidv7 } from "uuid";

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
 * Generate and retrieve the UUID for Version 7.
 * 
 * The strings can be sorted in chronological order of generation.
 * 
 * Returned as a string with 32 hyphenated characters removed.
 * 
 * If [baseTime] is specified, the date and time to be generated can be adjusted. 
 * If [reverse] is specified, the elapsed time from [baseTime] is reversed.
 * 
 * Version7のUUIDを生成し取得します。
 * 
 * 文字列を生成した時系列順にソート可能です。
 * 
 * 32文字のハイフンが取り除かれた文字列として返されます。
 * 
 * [baseTime]を指定した場合、生成する日時を調節できます。
 * [reverse]を指定した場合は、[baseTime]からの経過時間を反転させた値を使用します。
 * 
 * @param {Object} options - Options for UUID generation
 * @param {Date} [options.baseTime] - Base time for UUID generation (defaults to current time)
 * @param {boolean} [options.reverse=false] - Whether to reverse the timestamp
 * @return {string} UUID v7 without hyphens
 */
export function uuid(options?: { baseTime?: Date; reverse?: boolean }): string {
  const baseTime = options?.baseTime ?? new Date();
  const reverse = options?.reverse ?? false;
  
  const generated = uuidv7({ msecs: baseTime.getTime() }).replace(/-/g, "");
  if (reverse) {
    return _createComplementaryString(generated);
  }
  return generated; 
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

function _createComplementaryString(originalString: string): string {
  let buffer = "";
  const charList = "0123456789abcdef";
  for (let i = 0; i < originalString.length; i++) {
    const charIndex = charList.indexOf(originalString[i]);
    if (charIndex == -1) {
      continue;
    }
    const complementIndex = charList.length - charIndex - 1;
    buffer += charList[complementIndex];
  }
  return buffer;
}