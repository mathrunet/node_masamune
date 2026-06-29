import { ModelFieldValueConverter } from "../model_field_value_converter";
import { ModelServerCommandBase } from "../model_field_value";
import { ModelFieldValueConverterUtils } from "../default_model_field_value_converter";

/**
 * ModelServerCommandBase ModelFieldValueConverter.
 * 
 * ModelServerCommandBase用のModelFieldValueConverter。
 */
export class ModelServerCommandBaseConverter extends ModelFieldValueConverter {
  /**
   * ModelServerCommandBase ModelFieldValueConverter.
   * 
   * ModelServerCommandBase用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "ModelServerCommandBase";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value !== null && typeof value === "object" && "@type" in value && value["@type"] === this.type) {
      const command = value["@command"] as string | null | undefined ?? "";
      const publicParameters = value["@public"] as { [field: string]: any } | null | undefined ?? {};
      const privateParameters = value["@private"] as { [field: string]: any } | null | undefined ?? {};
      const publicConverted = ModelFieldValueConverterUtils.convertFrom({ data: publicParameters });
      const privateConverted = ModelFieldValueConverterUtils.convertFrom({ data: privateParameters });
      return {
        [key]: new ModelServerCommandBase({
          command: command,
          publicParameters: publicConverted,
          privateParameters: privateConverted,
          source: "server",
        }),
      };
    }
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    if (value instanceof ModelServerCommandBase) {
      const publicParameters = ModelFieldValueConverterUtils.convertTo({ data: value["@public"] as { [field: string]: any } });
      const privateParameters = ModelFieldValueConverterUtils.convertTo({ data: value["@private"] as { [field: string]: any } });
      return {
        [key]: {
          "@type": this.type,
          "@command": value["@command"],
          "@public": publicParameters,
          "@private": privateParameters,
          "@source": value["@source"],
        },
      };
    }
    return null;
  }
}
