import { ModelFieldValueConverter } from "../model_field_value_converter";

/**
 * Enum ModelFieldValueConverter.
 * 
 * Enum用のModelFieldValueConverter。
 */
export class ModelEnumConverter extends ModelFieldValueConverter {
  /**
   * Enum ModelFieldValueConverter.
   * 
   * Enum用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "Enum";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    return null;
  }

  convertTo(
    key: string,
    value: any,
    original: { [field: string]: any },
  ): { [field: string]: any } | null {
    return null;
  }
}