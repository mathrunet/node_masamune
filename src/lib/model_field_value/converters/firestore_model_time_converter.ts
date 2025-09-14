import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { Timestamp } from "firebase-admin/firestore";

/**
 * FirestoreConverter for [ModelTime].
 * 
 * [ModelTime]用のFirestoreConverter。
 */
export class FirestoreModelTimeConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelTime].
   * 
   * [ModelTime]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelTime";

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

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (typeof value === "number") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@type": this.type,
            "@time": value,
          },
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
            "@time": value.toDate().getTime() * 1000,
          },
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
              "@time": tmp,
            });
          } else if (tmp instanceof Timestamp) {
            res.push({
              "@type": this.type,
              "@time": tmp.toDate().getTime() * 1000,
            });
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
      if (targetMap != null) {
        const res: { [field: string]: any } = {};
        for (const k in value) {
          const val = value[k];
          const mapVal = targetMap[k] as { [field: string]: any } | null | undefined ?? {};
          const type = mapVal["@type"] as string | null | undefined ?? "";
          if (type != this.type) {
            continue;
          }
          if (typeof val === "number") {
            res[k] = {
              "@type": this.type,
              "@time": val,
            };
          } else if (val instanceof Timestamp) {
            res[k] = {
              "@type": this.type,
              "@time": val.toDate().getTime() * 1000,
            };
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
    _original: { [field: string]: any }): { [field: string]: any } | null {
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const val = value["@time"] as number | null | undefined ?? 0;
        const targetKey = `#${key}`;
        return {
          [targetKey]: {
            "@type": this.type,
            "@time": val,
            "@target": key,
          },
          [key]: FirestoreModelTimeConverter._createTimestampFromMicroseconds(val),
        };
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        const target: any[] = [];
        const res: any[] = [];
        const targetKey = `#${key}`;
        for (const entry of list) {
          const time = entry["@time"] as number | null | undefined ?? 0;
          target.push({
            "@type": this.type,
            "@time": time,
            "@target": key,
          });
          res.push(FirestoreModelTimeConverter._createTimestampFromMicroseconds(time));
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
          const time = entry["@time"] as number | null | undefined ?? 0;
          target[k] = {
            "@type": this.type,
            "@time": time,
            "@target": key,
          };
          res[k] = FirestoreModelTimeConverter._createTimestampFromMicroseconds(time);
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