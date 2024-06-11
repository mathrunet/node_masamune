import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { DocumentReference } from "firebase-admin/firestore";

/**
 * FirestoreConverter for [ModelRef].
 * 
 * [ModelRef]用のFirestoreConverter。
 */
export class FirestoreModelRefConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelRef].
   * 
   * [ModelRef]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelRefBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    console.log(`${key} is ${typeof value}`);
    if (value instanceof DocumentReference) {
      return {
        [key]: {
          "@ref": value.path,
          ...this.header(),
        },
      };
    } else if (Array.isArray(value)) {
        const res: { [field: string]: any }[] = [];
      for (const tmp of value) {
        if (tmp instanceof DocumentReference) {
          res.push({
            "@ref": tmp.path,
            ...this.header(),
          });
        }
      }
      if (res.length > 0) {
        return {
          [key]: res,
        };
      }
    } else if (isDynamicMap(value)) {
      const res: {
        [field: string]: { [field: string]: any }
      } = {};
      for (const k in value) {
        const val = value[k];
        if (val instanceof DocumentReference) {
          res[k] = {
            "@ref": val.path,
            ...this.header(),
          };
        }
      }
      if (Object.keys(res).length > 0) {
        return {
          [key]: res,
        };
      }
    }
    return null;
  }
}
