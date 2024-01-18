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
      const targetMap = original[targetKey] as { [field: string]: any } | null ?? {};
      const type = targetMap["@type"] as string | null ?? "";
      if (type == this.type) {
        const splitted = String(value).replace("-", "_").split("_");
        return {
          key: targetMap["@localized"],
        };
      }
    }
    return null;
  }
}
