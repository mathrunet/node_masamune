import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelVideoUri } from "../model_field_value";

/**
 * ModelVideoUri ModelFieldValueConverter.
 * 
 * ModelVideoUri用のModelFieldValueConverter。
 */
export class ModelVideoUriConverter extends ModelFieldValueConverter {
  /**
   * ModelVideoUri ModelFieldValueConverter.
   * 
   * ModelVideoUri用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelVideoUri";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const uri = value["@uri"] as string | null | undefined ?? "";
      return {
        [key]: new ModelVideoUri(uri, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelVideoUri) {
      return {
        [key]: {
          "@type": this.type,
          "@uri": value["@uri"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
