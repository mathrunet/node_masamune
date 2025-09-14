import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { FieldValue } from "@google-cloud/firestore";

/**
 * FirestoreConverter for [ModelSearch].
 * 
 * [ModelSearch]用のFirestoreConverter。
 */
export class FirestoreModelSearchConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelSearch].
   * 
   * [ModelSearch]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelSearch";

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
          [key]: value.map((e) => String(e)),
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
        const val = value["@list"] as string[] | null | undefined ?? [];
        const targetKey = `#${key}`;
        
        // Handle deletion of existing keys similar to Dart implementation
        const keys: { [field: string]: any } = {};
        const targetData = original[targetKey] as { [field: string]: any } | null | undefined;
        const existingKeys = (targetData && targetData["@list"]) as { [field: string]: any } | null | undefined ?? {};
        
        // Mark existing keys for deletion
        for (const existingKey in existingKeys) {
          keys[existingKey] = FieldValue.delete();
        }
        
        // Set new keys to true
        for (const searchKey of val) {
          keys[searchKey] = true;
        }
        
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@list": keys,
            "@target": key,
          },
        };
        
        if (fromUser) {
          result[key] = val;
        }
        
        return result;
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        throw new Error("ModelSearch cannot be included in a listing or map. It must be placed in the top field.");
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
        throw new Error("ModelSearch cannot be included in a listing or map. It must be placed in the top field.");
      }
    }
    return null;
  }
}
