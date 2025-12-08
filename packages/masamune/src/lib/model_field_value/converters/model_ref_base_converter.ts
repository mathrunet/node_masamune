import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { DocumentReference } from "firebase-admin/firestore";
import { ModelRefBase } from "../model_field_value";

/**
 * ModelFieldValueConverter for [ModelRefBase].
 * 
 * [ModelRefBase]用のModelFieldValueConverter。
 */
export class ModelRefBaseConverter extends ModelFieldValueConverter {
  /**
   * ModelRefBase ModelFieldValueConverter.
   * 
   * ModelRefBase用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelRefBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const ref = value["@ref"] as string | null | undefined ?? "";
      const doc = value["@doc"] as DocumentReference | undefined ?? undefined;
      return {
        [key]: new ModelRefBase(ref, doc, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelRefBase) {
      return {
        [key]: {
          "@type": this.type,
          "@ref": value["@ref"],
          "@doc": value["@doc"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelRef].
 * 
 * [ModelRef]用のFirestoreConverter。
 */
export class FirestoreModelRefBaseConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelRef].
   * 
   * [ModelRef]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelRefBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (value instanceof DocumentReference) {
      const path = value.path.replace(/\/+$/, '');
      return {
        [key]: {
          "@type": "ModelRefBase",
          "@ref": path, // Remove trailing slashes
          "@doc": firestoreInstance.doc(path),
        },
      };
    } else if (Array.isArray(value)) {
      const res: { [field: string]: any }[] = [];
      for (const tmp of value) {
        if (tmp instanceof DocumentReference) {
          const path = tmp.path.replace(/\/+$/, '');
          res.push({
            "@type": "ModelRefBase",
            "@ref": path, // Remove trailing slashes
            "@doc": firestoreInstance.doc(path),
          });
        }
      }
      if (res.length > 0) {
        return {
          [key]: res,
        };
      }
    } else if (isDynamicMap(value)) {
      const res: {
        [field: string]: { [field: string]: any }
      } = {};
      for (const k in value) {
        const val = value[k];
        if (val instanceof DocumentReference) {
          const path = val.path.replace(/\/+$/, '');
          res[k] = {
            "@type": "ModelRefBase",
            "@ref": path, // Remove trailing slashes
            "@doc": firestoreInstance.doc(path),
          };
        }
      }
      if (Object.keys(res).length > 0) {
        return {
          [key]: res,
        };
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
      if (type.startsWith(this.type)) {
        const refPath = value["@ref"] as string | null | undefined ?? "";
        return {
          [key]: firestoreInstance.doc(refPath),
        };
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"]?.startsWith(this.type))) {
        const res: DocumentReference[] = [];
        for (const entry of list) {
          const refPath = entry["@ref"] as string | null | undefined ?? "";
          res.push(firestoreInstance.doc(refPath));
        }
        return {
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
      if (Object.keys(map).length > 0 && Object.values(map).every((e) => e["@type"]?.startsWith(this.type))) {
        const res: { [key: string]: DocumentReference } = {};
        for (const [k, entry] of Object.entries(map)) {
          const refPath = entry["@ref"] as string | null | undefined ?? "";
          res[k] = firestoreInstance.doc(refPath);
        }
        return {
          [key]: res,
        };
      }
    }
    return null;
  }
}
