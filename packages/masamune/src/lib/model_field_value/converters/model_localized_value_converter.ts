import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelLocalizedLocaleVaue, ModelLocalizedValue } from "../model_field_value";

/**
 * ModelLocalizedValue ModelFieldValueConverter.
 * 
 * ModelLocalizedValue用のModelFieldValueConverter。
 */
export class ModelLocalizedValueConverter extends ModelFieldValueConverter {
  /**
   * ModelLocalizedValue ModelFieldValueConverter.
   * 
   * ModelLocalizedValue用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelLocalizedValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const localized = value["@localized"] as { [field: string]: any } | null | undefined ?? {};
      const localizedValues: ModelLocalizedLocaleVaue[] = [];
      for (const locale in localized) {
        const split = locale.split("_");
        const language = split[0];
        const country = split.length > 1 ? split[1] : undefined;
        localizedValues.push(new ModelLocalizedLocaleVaue({
          language: language,
          country: country,
          value: localized[locale],
        }));
      }
      return {
        [key]: new ModelLocalizedValue(localizedValues, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelLocalizedValue) {
      const loalizedMap: { [locale: string]: any } = {};
      for (const locale of value["@localized"]) {
        loalizedMap[`${locale.language}${locale.country ? `_${locale.country}` : ""}`] = locale.value;
      }
      return {
        [key]: {
          "@type": this.type,
          "@localized": loalizedMap,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
