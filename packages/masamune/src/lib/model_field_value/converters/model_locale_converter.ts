import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelLocale } from "../model_field_value";

/**
 * ModelLocale ModelFieldValueConverter.
 * 
 * ModelLocale用のModelFieldValueConverter。
 */
export class ModelLocaleConverter extends ModelFieldValueConverter {
  /**
   * ModelLocale ModelFieldValueConverter.
   * 
   * ModelLocale用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelLocale";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const language = value["@language"] as string | undefined ?? "en";
      const country = value["@country"] as string | undefined;
      return {
        [key]: new ModelLocale(language, country, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelLocale) {
      return {
        [key]: {
          "@type": this.type,
          "@language": value["@language"],
          "@country": value["@country"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
