import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

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
          key: value.map((e) => String(e)),
        };
      }
    }
    return null;
  }
}
