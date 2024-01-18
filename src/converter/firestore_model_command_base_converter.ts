import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * FirestoreConverter for [ModelServerCommandBase].
 * 
 * [ModelServerCommandBase]用のFirestoreConverter。
 */
export class FirestoreModelCommandBaseConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelServerCommandBase].
   * 
   * [ModelServerCommandBase]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelServerCommandBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (typeof value === "string") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const publicParameters = original["@public"] as { [field: string]: any } | null | undefined ?? {};
      const privateParameters = original["@private"] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@command": value,
            "@public": publicParameters,
            "@private": privateParameters,
            ...this.header(),
          }
        };
      }
    }
    return null;
  }
}
