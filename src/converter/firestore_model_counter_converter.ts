import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";
import { isDynamicMap } from "../lib/utils";

/**
 * FirestoreConverter for [ModelCounter].
 * 
 * [ModelCounter]用のFirestoreConverter。
 */
export class FirestoreModelCounterConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelCounter].
   * 
   * [ModelCounter]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelCounter";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: number[] = [];
        for (const tmp of value) {
          if (typeof tmp === "number") {
            res.push(tmp);
          }
        }
        if (res.length > 0) {
          return {
            key: res,
          };
        }
      }
    } else if (isDynamicMap(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: { [field: string]: any } } | null | undefined ?? {};
      targetMap
      if (targetMap != null) {
        const res: {
          [field: string]: number
        } = {};
        for (const key in value) {
          const val = value[key];
          const mapVal = targetMap[key] as { [field: string]: any } | null | undefined ?? {};
          const type = mapVal["@type"] as string | null | undefined ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "number") {
            res[key] = val;
          }
        }
        if (Object.keys(res).length > 0) {
          return {
            key: res,
          };
        }
      }
    } else if (typeof value === "number") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          key: value,
        };
      }
    }
    return null;
  }
}
