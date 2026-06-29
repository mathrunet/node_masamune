import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelVectorValue } from "../model_field_value";

/**
 * ModelVectorValue ModelFieldValueConverter.
 * 
 * ModelVectorValue用のModelFieldValueConverter。
 */
export class ModelVectorValueConverter extends ModelFieldValueConverter {
  /**
   * ModelVectorValue ModelFieldValueConverter.
   * 
   * ModelVectorValue用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelVectorValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const vector = value["@vector"] as number[] | null | undefined ?? [];
      return {
        [key]: new ModelVectorValue(vector, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelVectorValue) {
      return {
        [key]: {
          "@type": this.type,
          "@vector": value["@vector"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}