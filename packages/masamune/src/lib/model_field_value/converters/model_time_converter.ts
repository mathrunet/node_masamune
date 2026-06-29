import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelTime } from "../model_field_value";

/**
 * ModelTime ModelFieldValueConverter.
 * 
 * ModelTime用のModelFieldValueConverter。
 */
export class ModelTimeConverter extends ModelFieldValueConverter {
  /**
   * ModelTime ModelFieldValueConverter.
   * 
   * ModelTime用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelTime";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const time = value["@time"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelTime(new Date(time / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelTime) {
      return {
        [key]: {
          "@type": this.type,
          "@time": value["@time"] * 1000,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}