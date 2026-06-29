import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelTimestamp } from "../model_field_value";

/**
 * ModelTimestamp ModelFieldValueConverter.
 * 
 * ModelTimestamp用のModelFieldValueConverter。
 */
export class ModelTimestampConverter extends ModelFieldValueConverter {
  /**
   * ModelTimestamp ModelFieldValueConverter.
   * 
   * ModelTimestamp用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelTimestamp";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    // Skip if already a ModelTimestamp instance (e.g., from FirestoreConverter)
    if (value instanceof ModelTimestamp) {
      return { [key]: value };
    }
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const time = value["@time"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelTimestamp(new Date(time / 1000.0), "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelTimestamp) {
      // Pass through ModelTimestamp instance as-is; FirestoreConverter will handle it
      return { [key]: value };
    }
    return null;
  }
}
