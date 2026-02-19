import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelTimeRange } from "../model_field_value";

/**
 * ModelTimeRange ModelFieldValueConverter.
 * 
 * ModelTimeRange用のModelFieldValueConverter。
 */
export class ModelTimeRangeConverter extends ModelFieldValueConverter {
  /**
   * ModelTimeRange ModelFieldValueConverter.
   * 
   * ModelTimeRange用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelTimeRange";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const start = value["@start"] as number | null | undefined ?? 0;
      const end = value["@end"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelTimeRange(new Date(start / 1000.0), new Date(end / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelTimeRange) {
      return {
        [key]: {
          "@type": this.type,
          "@start": value["@start"] * 1000,
          "@end": value["@end"] * 1000,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelTimeRange].
 * 
 * [ModelTimeRange]用のFirestoreConverter。
 */
export class FirestoreModelTimeRangeConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelTimeRange].
   * 
   * [ModelTimeRange]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelTimeRange";

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
              [targetKey]: null,
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
            [targetKey]: null,
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
          [key]: `${new Date(start / 1000.0).toISOString()}|${new Date(end / 1000.0).toISOString()}`,
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
          res.push(`${new Date(start / 1000.0).toISOString()}|${new Date(end / 1000.0).toISOString()}`);
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
          const start = entry["@start"] as number | null | undefined ?? 0;
          const end = entry["@end"] as number | null | undefined ?? 0;
          target[k] = {
            "@type": this.type,
            "@start": start,
            "@end": end,
            "@target": key,
          };
          res = `${new Date(start / 1000.0).toISOString()}|${new Date(end / 1000.0).toISOString()}`;
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