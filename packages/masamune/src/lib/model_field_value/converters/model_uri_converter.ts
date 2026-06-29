import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelUri } from "../model_field_value";

/**
 * ModelUri ModelFieldValueConverter.
 * 
 * ModelUri用のModelFieldValueConverter。
 */
export class ModelUriConverter extends ModelFieldValueConverter {
  /**
   * ModelUri ModelFieldValueConverter.
   * 
   * ModelUri用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelUri";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const uri = value["@uri"] as string | null | undefined ?? "";
      return {
        [key]: new ModelUri(uri, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelUri) {
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

