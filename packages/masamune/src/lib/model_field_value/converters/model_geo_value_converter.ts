import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { GeoPoint } from "firebase-admin/firestore";
import { ModelGeoValue } from "../model_field_value";

/**
 * ModelGeoValue ModelFieldValueConverter.
 * 
 * ModelGeoValue用のModelFieldValueConverter。
 */
export class ModelGeoValueConverter extends ModelFieldValueConverter {
  /**
   * ModelGeoValue ModelFieldValueConverter.
   * 
   * ModelGeoValue用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelGeoValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const latitude = value["@latitude"] as number | null | undefined ?? 0;
      const longitude = value["@longitude"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelGeoValue(latitude, longitude, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelGeoValue) {
      return {
        [key]: {
          "@type": this.type,
          "@geoHash": value.geoHash(),
          "@latitude": value["@latitude"],
          "@longitude": value["@longitude"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelGeoValue].
 * 
 * [ModelGeoValue]用のFirestoreConverter。
 */
export class FirestoreModelGeoValueConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelGeoValue].
   * 
   * [ModelGeoValue]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelGeoValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (typeof value === "string" || value instanceof GeoPoint) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@type": this.type,
            "@latitude": targetMap["@latitude"] as number | null | undefined ?? 0,
            "@longitude": targetMap["@longitude"] as number | null | undefined ?? 0,
          },
          [targetKey]: null,
        };
      }
    } else if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: { [field: string]: any }[] = [];
        for (const tmp of targetList) {
          res.push({
            "@type": this.type,
            "@latitude": tmp["@latitude"] as number | null | undefined ?? 0,
            "@longitude": tmp["@longitude"] as number | null | undefined ?? 0,
          });
        }
        return {
          [key]: res,
          [targetKey]: null,
        };
      }
    } else if (isDynamicMap(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: { [field: string]: any } } | null | undefined ?? {};
      targetMap
      if (targetMap != null) {
        const res: {
          [field: string]: { [field: string]: any }
        } = {};
        for (const key in value) {
          const val = value[key];
          const mapVal = targetMap[key] as { [field: string]: any } | null | undefined ?? {};
          const type = mapVal["@type"] as string | null | undefined ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "string" || val instanceof GeoPoint) {
            res[key] = {
              "@type": this.type,
              "@latitude": mapVal["@latitude"] as number | null | undefined ?? 0,
              "@longitude": mapVal["@longitude"] as number | null | undefined ?? 0,
            };
          }
        }
        if (Object.keys(res).length > 0) {
          return {
            [targetKey]: null,
            [key]: res,
          };
        }
      }
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    _original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const fromUser = value["@source"] === "user";
        const geoHash = value["@geoHash"] as string | null | undefined ?? "";
        const latitude = value["@latitude"] as number | null | undefined ?? 0;
        const longitude = value["@longitude"] as number | null | undefined ?? 0;
        const targetKey = `#${key}`;
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": type,
            "@latitude": latitude,
            "@longitude": longitude,
            "@target": key,
          },
        };
        if (fromUser) {
          result[key] = geoHash;
        }
        return result;
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        const target: any[] = [];
        const res: string[] = [];
        const targetKey = `#${key}`;
        for (const entry of list) {
          const fromUser = entry["@source"] === "user";
          const geoHash = entry["@geoHash"] as string | null | undefined ?? "";
          const latitude = entry["@latitude"] as number | null | undefined ?? 0;
          const longitude = entry["@longitude"] as number | null | undefined ?? 0;
          target.push({
            "@type": this.type,
            "@latitude": latitude,
            "@longitude": longitude,
            "@target": key,
          });
          if (fromUser) {
            res.push(geoHash);
          }
        }
        return {
          [targetKey]: target,
          [key]: res,
        };
      }
    } else if (isDynamicMap(value)) {
      const map: { [key: string]: any } = {};
      for (const k in value) {
        const v = value[k];
        if (v != null && typeof v === "object" && "@type" in v) {
          map[k] = v;
        }
      }
      if (Object.keys(map).length > 0 && Object.values(map).every((e) => e["@type"] === this.type)) {
        const target: { [key: string]: any } = {};
        let res: string | null = null;
        const targetKey = `#${key}`;
        for (const [k, entry] of Object.entries(map)) {
          const fromUser = entry["@source"] === "user";
          const geoHash = entry["@geoHash"] as string | null | undefined ?? "";
          const latitude = entry["@latitude"] as number | null | undefined ?? 0;
          const longitude = entry["@longitude"] as number | null | undefined ?? 0;
          target[k] = {
            "@type": this.type,
            "@latitude": latitude,
            "@longitude": longitude,
            "@target": key,
          };
          if (fromUser) {
            res = geoHash;
          }
        }
        return {
          [targetKey]: target,
          [key]: res,
        };
      }
    }
    return null;
  }
}
