import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";
import { isDynamicMap } from "../lib/utils";
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
    if (Array.isArray(value)) {
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
          key: res,
        };
      }
    } else if (isDynamicMap(value)) {
      const res: {
        [field: string]: { [field: string]: any }
      } = {};
      for (const key in value) {
        const val = value[key];
        if (val instanceof DocumentReference) {
          res[key] = {
            "@ref": val.path,
            ...this.header(),
          };
        }
      }
      if (Object.keys(res).length > 0) {
        return {
          key: res,
        };
      }
    } else if (value instanceof DocumentReference) {
      return {
        key: {
          "@ref": value.path,
          ...this.header(),
        },
      };
    }
    return null;
  }
}
