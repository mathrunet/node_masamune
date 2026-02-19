import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { ModelDate } from "../model_field_value";
import { createTimestampFromMicroseconds, FirestoreModelTimestampConverter } from "./model_timestamp_converter";

/**
 * ModelDate ModelFieldValueConverter.
 * 
 * ModelDate用のModelFieldValueConverter。
 */
export class ModelDateConverter extends ModelFieldValueConverter {
  /**
   * ModelDate ModelFieldValueConverter.
   * 
   * ModelDate用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelDate";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const time = value["@time"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelDate(new Date(time / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelDate) {
      return {
        [key]: {
          "@type": this.type,
          "@time": value["@time"] * 1000,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelDate].
 * 
 * [ModelDate]用のFirestoreConverter。
 */
export class FirestoreModelDateConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelDate].
   * 
   * [ModelDate]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelDate";

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
        return {
          [key]: {
            "@type": this.type,
            "@time": value * 1000, // Convert milliseconds to microseconds
            "@now": false,
            "@source": "server"
          },
          [targetKey]: null,
        };
      }
    } else if (value instanceof Timestamp) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@type": this.type,
            "@time": value.toMillis() * 1000, // Convert milliseconds to microseconds
            "@now": false,
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
        for (const tmp of value) {
          if (typeof tmp === "number") {
            res.push({
              "@type": this.type,
              "@time": tmp * 1000, // Convert milliseconds to microseconds
              "@now": false,
              "@source": "server"
            });
          } else if (tmp instanceof Timestamp) {
            res.push({
              "@type": this.type,
              "@time": tmp.toMillis() * 1000, // Convert milliseconds to microseconds
              "@now": false,
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
            res[key] = {
              "@type": this.type,
              "@time": val * 1000, // Convert milliseconds to microseconds
              "@now": false,
              "@source": "server"
            };
          } else if (val instanceof Timestamp) {
            res[key] = {
              "@type": this.type,
              "@time": val.toMillis() * 1000, // Convert milliseconds to microseconds
              "@now": false,
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
        const fromUser = (value["@source"] as string | null | undefined ?? "") === "user";
        const val = value["@time"] as number | null | undefined ?? 0;
        const useNow = value["@now"] as boolean | null | undefined ?? false;
        const targetKey = `#${key}`;

        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@time": val,
            "@target": key,
          },
        };

        if (fromUser) {
          if (useNow) {
            result[key] = FieldValue.serverTimestamp();
          } else {
            result[key] = createTimestampFromMicroseconds(val);
          }
        } else {
          result[key] = createTimestampFromMicroseconds(val);
        }

        return result;
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        const target: any[] = [];
        const res: any[] = [];
        const targetKey = `#${key}`;

        for (const entry of list) {
          const fromUser = (entry["@source"] as string | null | undefined ?? "") === "user";
          const time = entry["@time"] as number | null | undefined ?? 0;
          const useNow = entry["@now"] as boolean | null | undefined ?? false;

          target.push({
            "@type": this.type,
            "@time": time,
            "@target": key,
          });

          if (fromUser) {
            if (useNow) {
              res.push(FieldValue.serverTimestamp());
            } else {
              res.push(createTimestampFromMicroseconds(time));
            }
          } else {
            res.push(createTimestampFromMicroseconds(time));
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
        let res: Timestamp | FieldValue | null = null;
        const targetKey = `#${key}`;

        for (const [k, entry] of Object.entries(map)) {
          const fromUser = (entry["@source"] as string | null | undefined ?? "") === "user";
          const time = entry["@time"] as number | null | undefined ?? 0;
          const useNow = entry["@now"] as boolean | null | undefined ?? false;

          target[k] = {
            "@type": this.type,
            "@time": time,
            "@target": key,
          };

          if (fromUser) {
            if (useNow) {
              res = FieldValue.serverTimestamp();
            } else {
              res = createTimestampFromMicroseconds(time);
            }
          } else {
            res = createTimestampFromMicroseconds(time);
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
