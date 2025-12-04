import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelVectorValue } from "../model_field_value";
import { firestore } from "firebase-admin";
import { VectorValue } from "@google-cloud/firestore";

/**
 * ModelVectorValue ModelFieldValueConverter.
 * 
 * ModelVectorValue用のModelFieldValueConverter。
 */
export class ModelVectorValueConverter extends ModelFieldValueConverter {
  /**
   * ModelVectorValue ModelFieldValueConverter.
   * 
   * ModelVectorValue用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelVectorValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const vector = value["@vector"] as number[] | null | undefined ?? [];
      return {
        [key]: new ModelVectorValue(vector, "server"),
      };
    }
    return null;
  }
  
  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelVectorValue) {
      return {
        [key]: {
          "@type": this.type,
          "@vector": value["@vector"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelVectorValue].
 * 
 * [ModelVectorValue]用のFirestoreConverter。
 */
export class FirestoreModelVectorValueConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelVectorValue].
   * 
   * [ModelVectorValue]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelVectorValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (value instanceof VectorValue) {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        const vectorValue = value.toArray();
        const vector: number[] = [];
        for (const item of vectorValue) {
          vector.push(Number(item));
        }
        return {
          [key]: {
            "@type": this.type,
            "@vector": vector,
          },
          [targetKey]: null,
        };
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
    if (value != null && typeof value === "object" && "@type" in value) {
      const type = value["@type"] as string | null | undefined ?? "";
      if (type === this.type) {
        const fromUser = (value["@source"] as string | null | undefined ?? "") === "user";
        const val = value["@vector"] as number[] | null | undefined ?? [];
        const targetKey = `#${key}`;
        
        const result: { [field: string]: any } = {
          [targetKey]: {
            "@type": this.type,
            "@target": key,
          },
        };
        
        if (fromUser) {
          result[key] = firestore.FieldValue.vector(val);
        }
        
        return result;
      }
    } else if (Array.isArray(value)) {
      const list = value.filter((e) => e != null && typeof e === "object" && "@type" in e);
      if (list.length > 0 && list.every((e) => e["@type"] === this.type)) {
        throw new Error("ModelVectorValue cannot be included in a listing or map. It must be placed in the top field.");
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
        throw new Error("ModelVectorValue cannot be included in a listing or map. It must be placed in the top field.");
      }
    }
    return null;
  }
}
