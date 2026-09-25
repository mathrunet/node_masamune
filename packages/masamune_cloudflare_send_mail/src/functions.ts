import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { CloudflareSendMailWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 */
export const Functions = {
  /**
   * Send mail through Cloudflare Email Service (Email Sending).
   */
  sendMail: (options: CloudflareSendMailWorkersOptions = {}) => new WorkersData({ path: "/send_mail", func: require("./functions/send_mail"), options: options as WorkersOptions }),
} as const;
