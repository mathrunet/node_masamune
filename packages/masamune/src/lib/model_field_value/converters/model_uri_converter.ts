import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelUri } from "../model_field_value";

/**
 * ModelUri ModelFieldValueConverter.
 * 
 * ModelUri用のModelFieldValueConverter。
 */
export class ModelUriConverter extends ModelFieldValueConverter {
  /**
   * ModelUri ModelFieldValueConverter.
   * 
   * ModelUri用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelUri";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const uri = value["@uri"] as string | null | undefined ?? "";
      return {
        [key]: new ModelUri(uri, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelUri) {
      return {
        [key]: {
          "@type": this.type,
          "@uri": value["@uri"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}


/**
 * FirestoreConverter for [ModelUri].
 * 
 * [ModelUri]用のFirestoreConverter。
 */
export class FirestoreModelUriConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelUri].
   * 
   * [ModelUri]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelUri";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (typeof value === "string") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@type": this.type,
            "@uri": value,
          },
          [targetKey]: null,
        };
      }
    } else if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: { [field: string]: any }[] = [];
        for (const tmp of value) {
          res.push({
            "@type": this.type,
            "@uri": tmp,
          });
        }
        if (res.length > 0) {
          return {
            [key]: res,
            [targetKey]: null,
          };
        }
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
          res[key] = {
            "@type": this.type,
            "@uri": val,
          };
        }
        if (Object.keys(res).length > 0) {
          return {
            [key]: res,
            [targetKey]: null,
          };
        }
      }
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (isDynamicMap(value) && value["@type"] !== undefined) {
      const type = value["@type"] as string || "";
      if (type === this.type) {
        const val = value["@uri"] as string || "";
        const targetKey = `#${key}`;
        return {
          [targetKey]: {
            "@type": this.type,
            "@uri": val,
            "@target": key,
          },
          [key]: val,
        };
      }
    } else if (Array.isArray(value)) {
      const list = value.filter(e => isDynamicMap(e));
      if (list.length > 0 && list.every((e: any) => e["@type"] === this.type)) {
        const target: { [field: string]: any }[] = [];
        const res: string[] = [];
        const targetKey = `#${key}`;
        for (const entry of list) {
          const uri = entry["@uri"] as string || "";
          target.push({
            "@type": this.type,
            "@uri": uri,
            "@target": key,
          });
          res.push(uri);
        }
        return {
          [targetKey]: target,
          [key]: res,
        };
      }
    } else if (isDynamicMap(value)) {
      const map = Object.entries(value).filter(([_, v]) => isDynamicMap(v));
      if (map.length > 0 && map.every(([_, v]) => (v as any)["@type"] === this.type)) {
        const target: { [field: string]: { [field: string]: any } } = {};
        let res: string | null = null;
        const targetKey = `#${key}`;
        for (const [k, v] of map) {
          const uri = (v as any)["@uri"] as string || "";
          target[k] = {
            "@type": this.type,
            "@uri": uri,
            "@target": key,
          };
          res = uri;
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
