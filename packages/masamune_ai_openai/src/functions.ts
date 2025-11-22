import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /** 
   * The text is generated using Open AI's GPT.
   * 
   * Open AIのChat GPTを利用して文章を生成します。
   */
  openAIChatGPT: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "openai_chat_gpt", func: require("./functions/openai_chat_gpt"), options: options }),
} as const;
