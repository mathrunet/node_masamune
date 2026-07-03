import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { SendGridWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Send mail through SendGrid.
   *
   * SendGridでメールを送信します。
   */
  sendGrid: (options: SendGridWorkersOptions = {}) => new WorkersData({ path: "/send_grid", func: require("./functions/send_grid"), options: options as WorkersOptions }),
} as const;
