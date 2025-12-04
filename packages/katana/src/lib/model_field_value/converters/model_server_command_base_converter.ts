import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelServerCommandBase } from "../model_field_value";

/**
 * ModelServerCommandBase ModelFieldValueConverter.
 * 
 * ModelServerCommandBase用のModelFieldValueConverter。
 */
export class ModelServerCommandBaseConverter extends ModelFieldValueConverter {
  /**
   * ModelServerCommandBase ModelFieldValueConverter.
   * 
   * ModelServerCommandBase用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelServerCommandBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const command = value["@command"] as string | null | undefined ?? "";
      const publicParameters = value["@public"] as { [field: string]: any } | null | undefined ?? {};
      const privateParameters = value["@private"] as { [field: string]: any } | null | undefined ?? {};
      return {
        [key]: new ModelServerCommandBase(command, publicParameters, privateParameters, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelServerCommandBase) {
      return {
        [key]: {
          "@type": this.type,
          "@command": value["@command"],
          "@public": value["@public"] as { [field: string]: any },
          "@private": value["@private"] as { [field: string]: any },
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}

/**
 * FirestoreConverter for [ModelServerCommandBase].
 * 
 * [ModelServerCommandBase]用のFirestoreConverter。
 */
export class FirestoreModelServerCommandBaseConverter extends FirestoreModelFieldValueConverter {
  /**
   * FirestoreConverter for [ModelServerCommandBase].
   * 
   * [ModelServerCommandBase]用のFirestoreConverter。
   */
  constructor() {
    super();
  }

  type: string = "ModelServerCommandBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore
  ): { [field: string]: any } | null {
    if (typeof value === "string") {
      const targetKey = `#${key}`;
      const targetMap = original[targetKey] as { [field: string]: any } | null | undefined ?? {};
      const publicParameters = original["@public"] as { [field: string]: any } | null | undefined ?? {};
      const privateParameters = original["@private"] as { [field: string]: any } | null | undefined ?? {};
      const type = targetMap["@type"] as string | null | undefined ?? "";
      if (type == this.type) {
        return {
          [key]: {
            "@command": value,
            "@public": publicParameters,
            "@private": privateParameters,
            ...this.header(),
          }
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
      if (type === this.type) {
        const command = value["@command"] as string | null | undefined ?? "";
        const publicParameters = value["@public"] as { [field: string]: any } | null | undefined ?? {};
        const privateParameters = value["@private"] as { [field: string]: any } | null | undefined ?? {};
        const targetKey = `#${key}`;
        return {
          ...publicParameters,
          [targetKey]: {
            "@type": this.type,
            "@command": command,
            "@public": publicParameters,
            "@private": privateParameters,
            "@target": key,
          },
          [key]: command,
        };
      }
    }
    return null;
  }
}
