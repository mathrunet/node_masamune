import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * FirestoreConverter for [Enum].
 * 
 * [Enum]用のFirestoreConverter。
 */
export class FirestoreEnumConverter extends FirestoreModelFieldValueConverter {
  type: string = "Enum";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    return null;
  }
}
