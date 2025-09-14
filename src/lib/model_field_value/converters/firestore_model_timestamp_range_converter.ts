import { FirestoreModelFieldValueConverter } from "../firestore_model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { Timestamp } from "firebase-admin/firestore";

/**
 * FirestoreConverter for [ModelTimestampRange].
 * 
 * [ModelTimestampRange]用のFirestoreConverter。
 */
export class FirestoreModelTimestampRangeConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelTimestampRange].
   * 
   * [ModelTimestampRange]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelTimestampRange";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    if (typeof value === "string") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        const splitted = value.split("|");
        if (splitted.length === 2) {
          const start = new Date(splitted[0]);
          const end = new Date(splitted[1]);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            return {
              [key]: {
                "@type": this.type,
                "@start": start.getTime() * 1000,
                "@end": end.getTime() * 1000,
              },
            };
          }
        }
      }
    } else if (Array.isArray(value)) {
      const targetKey = `#${key}`;
      const targetList = original[targetKey] as { [field: string]: any }[] | null | undefined ?? [];
      if (targetList != null && targetList.length > 0 && targetList.every((e) => e["@type"] === this.type)) {
        const res: any[] = [];
        for (const tmp of value) {
          if (typeof tmp === "string") {
            const splitted = tmp.split("|");
            if (splitted.length === 2) {
              const start = new Date(splitted[0]);
              const end = new Date(splitted[1]);
              if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                res.push({
                  "@type": this.type,
                  "@start": start.getTime() * 1000,
                  "@end": end.getTime() * 1000,
                });
              }
            }
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
          if (typeof val === "string") {
            const splitted = val.split("|");
            if (splitted.length === 2) {
              const start = new Date(splitted[0]);
              const end = new Date(splitted[1]);
              if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                res[k] = {
                  "@type": this.type,
                  "@start": start.getTime() * 1000,
                  "@end": end.getTime() * 1000,
                };
              }
            }
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
        const start = value["@start"] as number | null | undefined ?? 0;
        const end = value["@end"] as number | null | undefined ?? 0;
        const targetKey = `#${key}`;
        return {
          [targetKey]: {
            "@type": this.type,
            "@start": start,
            "@end": end,
            "@target": key,
          },
          [key]: `${new Date(start / 1000).toISOString()}|${new Date(end / 1000).toISOString()}`,
        };
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        const target: any[] = [];
        const res: string[] = [];
        const targetKey = `#${key}`;
        for (const entry of list) {
          const start = entry["@start"] as number | null | undefined ?? 0;
          const end = entry["@end"] as number | null | undefined ?? 0;
          target.push({
            "@type": this.type,
            "@start": start,
            "@end": end,
            "@target": key,
          });
          res.push(`${new Date(start / 1000).toISOString()}|${new Date(end / 1000).toISOString()}`);
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
        const res: { [key: string]: string } = {};
        const targetKey = `#${key}`;
        for (const [k, entry] of Object.entries(map)) {
          const start = entry["@start"] as number | null | undefined ?? 0;
          const end = entry["@end"] as number | null | undefined ?? 0;
          target[k] = {
            "@type": this.type,
            "@start": start,
            "@end": end,
            "@target": key,
          };
          res[k] = `${new Date(start / 1000).toISOString()}|${new Date(end / 1000).toISOString()}`;
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