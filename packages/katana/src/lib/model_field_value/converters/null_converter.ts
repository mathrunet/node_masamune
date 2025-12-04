import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { FieldValue } from "@google-cloud/firestore";
import { isDynamicMap } from "../../utils";

/**
 * Null ModelFieldValueConverter.
 * 
 * Null用のModelFieldValueConverter。
 */
export class ModelNullConverter extends ModelFieldValueConverter {
  /**
   * Null ModelFieldValueConverter.
   * 
   * Null用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "Null";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    return null;
  }
}

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
    if (isDynamicMap(value) && original[key] !== undefined) {
      const originalMap = original[key];
      if (isDynamicMap(originalMap)) {
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
