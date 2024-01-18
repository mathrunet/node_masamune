import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * FirestoreConverter for [ModelServerCommandBase].
 * 
 * [ModelServerCommandBase]用のFirestoreConverter。
 */
export class FirestoreModelCommandBaseConverter extends FirestoreModelFieldValueConverter {
  type: string = "ModelServerCommandBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (typeof value === "string") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null ?? {};
      const publicParameters = original["@public"] as { [field: string]: any } | null ?? {};
      const privateParameters = original["@private"] as { [field: string]: any } | null ?? {};
      const type = targetMap.get("@type", "");
      if (type == this.type) {
        return {
          key: {
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
