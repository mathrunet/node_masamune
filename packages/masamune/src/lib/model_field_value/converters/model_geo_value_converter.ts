import { ModelFieldValueConverter } from "../model_field_value_converter";
import { isDynamicMap } from "../../utils";
import { ModelGeoValue } from "../model_field_value";

/**
 * ModelGeoValue ModelFieldValueConverter.
 * 
 * ModelGeoValue用のModelFieldValueConverter。
 */
export class ModelGeoValueConverter extends ModelFieldValueConverter {
  /**
   * ModelGeoValue ModelFieldValueConverter.
   * 
   * ModelGeoValue用のModelFieldValueConverter。
 */
  constructor() {
    super();
  }
  type: string = "ModelGeoValue";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const latitude = value["@latitude"] as number | null | undefined ?? 0;
      const longitude = value["@longitude"] as number | null | undefined ?? 0;
      return {
        [key]: new ModelGeoValue(latitude, longitude, "server"),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelGeoValue) {
      return {
        [key]: {
          "@type": this.type,
          "@geoHash": value.geoHash(),
          "@latitude": value["@latitude"],
          "@longitude": value["@longitude"],
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
