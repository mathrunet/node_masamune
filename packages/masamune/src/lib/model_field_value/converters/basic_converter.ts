import { ModelFieldValueConverter } from "../model_field_value_converter";

/**
 * Normal ModelFieldValueConverter.
 * 
 * 通常のModelFieldValueConverter。
 */
export class ModelBasicConverter extends ModelFieldValueConverter {
  /**
   * Normal ModelFieldValueConverter.
   * 
   * 通常のModelFieldValueConverter。
   */
  constructor() {
    super();
  }
  type: string = "Object";

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
