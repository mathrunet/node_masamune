import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelCounter } from "../model_field_value";

/**
 * ModelCounter ModelFieldValueConverter.
 * 
 * ModelCounter用のModelFieldValueConverter。
 */
export class ModelCounterConverter extends ModelFieldValueConverter {
  /**
   * ModelCounter ModelFieldValueConverter.
   * 
   * ModelCounter用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelCounter";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const increment = value["@increment"] as number | null | undefined ?? 0;
      const count = value["@value"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelCounter(count, increment, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelCounter) {
      return {
        [key]: {
          "@type": this.type,
          "@value": value["@value"],
          "@increment": value["@increment"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
