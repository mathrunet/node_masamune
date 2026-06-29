import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelDate } from "../model_field_value";

/**
 * ModelDate ModelFieldValueConverter.
 * 
 * ModelDate用のModelFieldValueConverter。
 */
export class ModelDateConverter extends ModelFieldValueConverter {
  /**
   * ModelDate ModelFieldValueConverter.
   * 
   * ModelDate用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelDate";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const time = value["@time"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelDate(new Date(time / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelDate) {
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
