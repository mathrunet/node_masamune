import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

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
}
