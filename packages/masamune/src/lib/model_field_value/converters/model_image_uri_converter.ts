import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelImageUri } from "../model_field_value";

/**
 * ModelImageUri ModelFieldValueConverter.
 * 
 * ModelImageUri用のModelFieldValueConverter。
 */
export class ModelImageUriConverter extends ModelFieldValueConverter {
  /**
   * ModelImageUri ModelFieldValueConverter.
   * 
   * ModelImageUri用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelImageUri";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const uri = value["@uri"] as string | null | undefined ?? "";
      return {
        [key]: new ModelImageUri(uri, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelImageUri) {
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
