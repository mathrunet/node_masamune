import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";

/**
 * FirestoreConverter for [ModelLocalizedValue].
 * 
 * [ModelLocalizedValue]用のFirestoreConverter。
 */
export class FirestoreModelLocalizedValueConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelLocalizedValue].
   * 
   * [ModelLocalizedValue]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelLocalizedValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: targetMap["@localized"],
        };
      }
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const fromUser = (value["@source"] as string | null | undefined ?? "") === "user";
        const val = value["@localized"] as { [field: string]: any } | null | undefined ?? {};
        const targetKey = `#${key}`;
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@localized": val,
            "@target": key,
          },
        };
        if (fromUser) {
          // Convert to array format expected by Firestore for localized values
          const localizedArray: string[] = [];
          for (const locale in val) {
            localizedArray.push(`${locale}:${val[locale]}`);
          }
          result[key] = localizedArray;
        }
        return result;
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        throw new Error("ModelLocalizedValue cannot be included in a listing or map. It must be placed in the top field.");
      }
    } else if (isDynamicMap(value)) {
      const map: { [key: string]: any } = {};
      for (const k in value) {
        const v = value[k];
        if (v != null && typeof v === "object" && "@type" in v) {
          map[k] = v;
        }
      }
      if (Object.keys(map).length > 0 && Object.values(map).every((e) => e["@type"] === this.type)) {
        throw new Error("ModelLocalizedValue cannot be included in a listing or map. It must be placed in the top field.");
      }
    }
    return null;
  }
}
