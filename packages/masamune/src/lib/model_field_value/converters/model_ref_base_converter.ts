import { ModelFieldValueConverter } from "../model_field_value_converter";
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
      return {
        [key]: new ModelRefBase(ref, "server"),
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
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
