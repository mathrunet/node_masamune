import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";
import { isDynamicMap } from "../lib/utils";
import { GeoPoint } from "firebase-admin/firestore";

/**
 * FirestoreConverter for [ModelGeoValue].
 * 
 * [ModelGeoValue]用のFirestoreConverter。
 */
export class FirestoreModelGeoValueConverter extends FirestoreModelFieldValueConverter {
  type: string = "ModelGeoValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: string[] = [];
        for (const tmp of targetList) {
          res.push(
            tmp["@geoHash"] as string | null ?? "",
          );
        }
        if (res.length > 0) {
          return {
            key: res,
          };
        }
      }
    } else if (isDynamicMap(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: { [field: string]: any } } | null ?? {};
      targetMap
      if (targetMap != null) {
        const res: {
          [field: string]: string
        } = {};
        for (const key in value) {
          const val = value[key];
          const mapVal = targetMap[key];
          const type = mapVal["@type"] as string | null ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "string" || val instanceof GeoPoint) {
            res[key] = mapVal["@geoHash"] as string | null ?? "";
          }
        }
        if (Object.keys(res).length > 0) {
          return {
            key: res,
          };
        }
      }
    } else if (typeof value === "string" || value instanceof GeoPoint) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null ?? {};
      const type = targetMap["@type"] as string | null ?? "";
      if (type == this.type) {
        return {
          key: targetMap["@geoHash"] as string | null ?? "",
        };
      }
    }
    return null;
  }
}
