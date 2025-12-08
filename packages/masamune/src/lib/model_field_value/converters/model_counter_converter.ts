import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { FieldValue } from "@google-cloud/firestore";
import { ModelCounter } from "../model_field_value";

/**
 * ModelCounter ModelFieldValueConverter.
 * 
 * ModelCounter用のModelFieldValueConverter。
 */
export class ModelCounterConverter extends ModelFieldValueConverter {
  /**
   * ModelCounter ModelFieldValueConverter.
   * 
   * ModelCounter用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelCounter";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const increment = value["@increment"] as number | null | undefined ?? 0;
      const count = value["@value"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelCounter(count, increment, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelCounter) {
      return {
        [key]: {
          "@type": this.type,
          "@value": value["@value"],
          "@increment": value["@increment"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelCounter].
 * 
 * [ModelCounter]用のFirestoreConverter。
 */
export class FirestoreModelCounterConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelCounter].
   * 
   * [ModelCounter]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelCounter";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (typeof value === "number") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        const increment = targetMap["@increment"] as number | null | undefined ?? 0;
        return {
          [key]: {
            "@type": this.type,
            "@value": value,
            "@increment": increment,
            "@source": "server"
          },
          [targetKey]: null,
        };
      }
    } else if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: any[] = [];
        for (let i = 0; i < value.length; i++) {
          const tmp = value[i];
          if (typeof tmp === "number" && i < targetList.length) {
            const increment = targetList[i]["@increment"] as number | null | undefined ?? 0;
            res.push({
              "@type": this.type,
              "@value": tmp,
              "@increment": increment,
              "@source": "server"
            });
          }
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
          [field: string]: any
        } = {};
        for (const key in value) {
          const val = value[key];
          const mapVal = targetMap[key] as { [field: string]: any } | null | undefined ?? {};
          const type = mapVal["@type"] as string | null | undefined ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "number") {
            const increment = mapVal["@increment"] as number | null | undefined ?? 0;
            res[key] = {
              "@type": this.type,
              "@value": val,
              "@increment": increment,
              "@source": "server"
            };
          }
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
    _original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const fromUser = value["@source"] === "user";
        const count = value["@value"] as number | null | undefined ?? 0;
        const increment = value["@increment"] as number | null | undefined ?? 0;
        const targetKey = `#${key}`;
        return {
          [targetKey]: {
            "@type": this.type,
            "@value": count,
            "@increment": increment,
            "@target": key,
          },
          [key]: fromUser ? count : FieldValue.increment(increment),
        };
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        const target: any[] = [];
        const res: any[] = [];
        const targetKey = `#${key}`;
        for (const entry of list) {
          const fromUser = entry["@source"] === "user";
          const count = entry["@value"] as number | null | undefined ?? 0;
          const increment = entry["@increment"] as number | null | undefined ?? 0;
          target.push({
            "@type": this.type,
            "@value": count,
            "@increment": increment,
            "@target": key,
          });
          res.push(fromUser ? count : FieldValue.increment(increment));
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
        const res: { [key: string]: any } = {};
        const targetKey = `#${key}`;
        for (const [k, entry] of Object.entries(map)) {
          const fromUser = entry["@source"] === "user";
          const count = entry["@value"] as number | null | undefined ?? 0;
          const increment = entry["@increment"] as number | null | undefined ?? 0;
          target[k] = {
            "@type": this.type,
            "@value": count,
            "@increment": increment,
            "@target": key,
          };
          res[k] = fromUser ? count : FieldValue.increment(increment);
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
