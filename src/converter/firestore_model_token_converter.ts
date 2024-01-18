import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * FirestoreConverter for [ModelToken].
 * 
 * [ModelToken]用のFirestoreConverter。
 */
export class FirestoreModelTokenConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelToken].
   * 
   * [ModelToken]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelToken";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null ?? {};
      const type = targetMap["@type"] as string | null ?? "";
      if (type == this.type) {
        return {
          key: value.map((e) => String(e)),
        };
      }
    }
    return null;
  }
}
