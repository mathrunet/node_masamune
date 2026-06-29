import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelToken } from "../model_field_value";

/**
 * ModelToken ModelFieldValueConverter.
 * 
 * ModelToken用のModelFieldValueConverter。
 */
export class ModelTokenConverter extends ModelFieldValueConverter {
  /**
   * ModelToken ModelFieldValueConverter.
   * ModelToken用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelToken";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const list = value["@list"] as string[] | null | undefined ?? [];
      return {
        [key]: new ModelToken(list, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelToken) {
      return {
        [key]: {
          "@type": this.type,
          "@list": value["@list"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
