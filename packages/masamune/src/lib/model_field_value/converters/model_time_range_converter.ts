import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelTimeRange } from "../model_field_value";

/**
 * ModelTimeRange ModelFieldValueConverter.
 * 
 * ModelTimeRange用のModelFieldValueConverter。
 */
export class ModelTimeRangeConverter extends ModelFieldValueConverter {
  /**
   * ModelTimeRange ModelFieldValueConverter.
   * 
   * ModelTimeRange用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelTimeRange";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const start = value["@start"] as number | null | undefined ?? 0;
      const end = value["@end"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelTimeRange(new Date(start / 1000.0), new Date(end / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelTimeRange) {
      return {
        [key]: {
          "@type": this.type,
          "@start": value["@start"] * 1000,
          "@end": value["@end"] * 1000,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
