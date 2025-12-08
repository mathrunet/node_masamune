import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelLocale } from "../model_field_value";

/**
 * ModelLocale ModelFieldValueConverter.
 * 
 * ModelLocale用のModelFieldValueConverter。
 */
export class ModelLocaleConverter extends ModelFieldValueConverter {
  /**
   * ModelLocale ModelFieldValueConverter.
   * 
   * ModelLocale用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelLocale";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const language = value["@language"] as string | undefined ?? "en";
      const country = value["@country"] as string | undefined;
      return {
        [key]: new ModelLocale(language, country, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelLocale) {
      return {
        [key]: {
          "@type": this.type,
          "@language": value["@language"],
          "@country": value["@country"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * ModelLocale ModelFieldValueConverter.
 * 
 * ModelLocale用のModelFieldValueConverter。
 */
export class FirestoreModelLocaleConverter extends FirestoreModelFieldValueConverter {
  /**
   * ModelLocale ModelFieldValueConverter.
   * 
   * ModelLocale用のModelFieldValueConverter。
   * 
   * ModelLocale用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelLocale";

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
        const split = value.split("_");
        const language = split[0];
        const country = split.length > 1 ? split[1] : undefined;
        return {
          [key]: {
            "@type": this.type,
            "@language": language,
            "@country": country,
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
          const split = tmp.split("_");
          const language = split[0];
          const country = split.length > 1 ? split[1] : undefined;
          res.push({
            "@type": this.type,
            "@language": language,
            "@country": country,
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
          const split = val.split("_");
          const language = split[0];
          const country = split.length > 1 ? split[1] : undefined;
          res[key] = {
            "@type": this.type,
            "@language": language,
            "@country": country,
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
    _original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const language = value["@language"] as string | null | undefined ?? "";
        const country = value["@country"] as string | null | undefined ?? "";
        const targetKey = `#${key}`;
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@language": language,
            "@country": country,
            "@target": key,
          },
        };
        if (country) {
          result[key] = `${language}_${country}`;
        } else {
          result[key] = language;
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
          const language = entry["@language"] as string | null | undefined ?? "";
          const country = entry["@country"] as string | null | undefined ?? "";
          target.push({
            "@type": this.type,
            "@language": language,
            "@country": country,
            "@target": key,
          });
          if (country) {
            res.push(`${language}_${country}`);
          } else {
            res.push(language);
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
        const res: { [key: string]: string } = {};
        const targetKey = `#${key}`;
        for (const [k, entry] of Object.entries(map)) {
          const language = entry["@language"] as string | null | undefined ?? "";
          const country = entry["@country"] as string | null | undefined ?? "";
          target[k] = {
            "@type": this.type,
            "@language": language,
            "@country": country,
            "@target": key,
          };
          if (country) {
            res[k] = `${language}_${country}`;
          } else {
            res[k] = language;
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
