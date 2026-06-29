import { FirestoreModelFieldValueConverter } from "../model_field_value_converter";
import { DocumentReference, FieldValue, Timestamp, GeoPoint } from "@google-cloud/firestore";
import { utils } from "@mathrunet/masamune";
import { VectorValue } from "@google-cloud/firestore";

/**
 * FirestoreConverter for [Null].
 * 
 * [Null]用のFirestoreConverter。
 */
export class FirestoreNullConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [Null].
   * 
   * [Null]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "Null";

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
    if (value instanceof DocumentReference || value instanceof Timestamp || value instanceof Date || value instanceof FieldValue || value instanceof GeoPoint || value instanceof VectorValue) {
      return null;
    }
    if (utils.isDynamicMap(value) && original[key] !== undefined) {
      const originalMap = original[key];
      if (utils.isDynamicMap(originalMap)) {
        const newRes: { [field: string]: any } = { ...value };
        for (const [k, v] of Object.entries(originalMap)) {
          if (!value.hasOwnProperty(k) || value[k] === null) {
            newRes[k] = FieldValue.delete();
          }
        }
        return { [key]: newRes };
      }
    } else if (value === null) {
      return { [key]: FieldValue.delete() };
    }
    return null;
  }
}
