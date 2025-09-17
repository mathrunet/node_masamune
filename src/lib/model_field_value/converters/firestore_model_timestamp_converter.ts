import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "@google-cloud/firestore";

/**
 * FirestoreConverter for [ModelTimestamp].
 * 
 * [ModelTimestamp]用のFirestoreConverter。
 */
export class FirestoreModelTimestampConverter extends FirestoreModelFieldValueConverter {
  private static _createTimestampFromMicroseconds(microseconds: number): Timestamp {
    if (microseconds >= 0) {
      return Timestamp.fromMillis(microseconds / 1000);
    }
    const seconds = Math.floor(microseconds / 1000000);
    const remainingMicros = microseconds - (seconds * 1000000);
    const nanoseconds = remainingMicros * 1000;
    if (nanoseconds < 0) {
      return new Timestamp(seconds - 1, nanoseconds + 1000000000);
    }
    return new Timestamp(seconds, nanoseconds);
  }

  /**
   * FirestoreConverter for [ModelTimestamp].
   * 
   * [ModelTimestamp]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelTimestamp";

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
          [key]: value,
        };
      }
    } else if (value instanceof Timestamp) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: value.toMillis(),
        };
      }
    } else if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: number[] = [];
        for (const tmp of value) {
          if (typeof tmp === "number") {
            res.push(tmp);
          } else if (tmp instanceof Timestamp) {
            res.push(tmp.toMillis());
          }
        }
        if (res.length > 0) {
          return {
            [key]: res,
          };
        }
      }
    } else if (isDynamicMap(value)) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: { [field: string]: any } } | null | undefined ?? {};
      targetMap
      if (targetMap != null) {
        const res: {
          [field: string]: number
        } = {};
        for (const key in value) {
          const val = value[key];
          const mapVal = targetMap[key] as { [field: string]: any } | null | undefined ?? {};
          const type = mapVal["@type"] as string | null | undefined ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "number") {
            res[key] = val;
          } else if (val instanceof Timestamp) {
            res[key] = val.toMillis();
          }
        }
        if (Object.keys(res).length > 0) {
          return {
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
    console.log(`${key} is ${typeof value}`);
    console.log(`value: ${JSON.stringify(value)} ${value["@type"] as string | null | undefined ?? ""}`);
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const fromUser = (value["@source"] as string | null | undefined ?? "") === "user";
        const val = value["@timestamp"] as number | null | undefined ?? 0;
        const useNow = value["@now"] as boolean | null | undefined ?? false;
        const targetKey = `#${key}`;
        
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@timestamp": val,
            "@target": key,
          },
        };
        
        if (fromUser) {
          if (useNow) {
            result[key] = FieldValue.serverTimestamp();
          } else {
            result[key] = FirestoreModelTimestampConverter._createTimestampFromMicroseconds(val);
          }
        } else {
          result[key] = FirestoreModelTimestampConverter._createTimestampFromMicroseconds(val);
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
          const time = entry["@timestamp"] as number | null | undefined ?? 0;
          const useNow = entry["@now"] as boolean | null | undefined ?? false;
          
          target.push({
            "@type": this.type,
            "@timestamp": time,
            "@target": key,
          });
          
          if (fromUser) {
            if (useNow) {
              res.push(FieldValue.serverTimestamp());
            } else {
              res.push(FirestoreModelTimestampConverter._createTimestampFromMicroseconds(time));
            }
          } else {
            res.push(FirestoreModelTimestampConverter._createTimestampFromMicroseconds(time));
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
        const res: { [key: string]: any } = {};
        const targetKey = `#${key}`;
        
        for (const [k, entry] of Object.entries(map)) {
          const fromUser = (entry["@source"] as string | null | undefined ?? "") === "user";
          const time = entry["@timestamp"] as number | null | undefined ?? 0;
          const useNow = entry["@now"] as boolean | null | undefined ?? false;
          
          target[k] = {
            "@type": this.type,
            "@timestamp": time,
            "@target": key,
          };
          
          if (fromUser) {
            if (useNow) {
              res[k] = FieldValue.serverTimestamp();
            } else {
              res[k] = FirestoreModelTimestampConverter._createTimestampFromMicroseconds(time);
            }
          } else {
            res[k] = FirestoreModelTimestampConverter._createTimestampFromMicroseconds(time);
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
