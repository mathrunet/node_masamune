import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { FieldValue } from "@google-cloud/firestore";
import { ModelSearch } from "../model_field_value";

/**
 * ModelSearch ModelFieldValueConverter.
 * 
 * ModelSearch用のModelFieldValueConverter。
 */
export class ModelSearchConverter extends ModelFieldValueConverter {
  /**
   * ModelSearch ModelFieldValueConverter.
   * 
   * ModelSearch用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelSearch";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const list = value["@list"] as string[] | null | undefined ?? [];
      return {
        [key]: new ModelSearch(list, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelSearch) {
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
