import { ModelFieldValueConverter } from "../model_field_value_converter";

/**
 * Null ModelFieldValueConverter.
 * 
 * Null用のModelFieldValueConverter。
 */
export class ModelNullConverter extends ModelFieldValueConverter {
  /**
   * Null ModelFieldValueConverter.
   * 
   * Null用のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "Null";

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
