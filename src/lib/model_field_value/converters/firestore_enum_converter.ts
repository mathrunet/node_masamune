import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";

/**
 * FirestoreConverter for [Enum].
 * 
 * [Enum]用のFirestoreConverter。
 */
export class FirestoreEnumConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [Enum].
   * 
   * [Enum]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "Enum";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    return null;
  }
}
