import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * A function for scheduling tasks.
   * 
   * TaskをスケジュールするためのFunction。
   */
  taskScheduler: (options: masamune.SchedulerFunctionsOptions = {}) => new masamune.FunctionsData({ id: "task_scheduler", func: require("./functions/task_scheduler"), options: options }),
  /**
   * A function for cleaning up tasks.
   * 
   * TaskをクリーンアップするためのFunction。
   */
  taskCleaner: (options: masamune.SchedulerFunctionsOptions = {}) => new masamune.FunctionsData({ id: "task_cleaner", func: require("./functions/task_cleaner"), options: options }),
  /**
   * A function for processing workflows.
   * 
   * Workflowを処理するためのFunction。
   */
  workflowScheduler: (options: masamune.SchedulerFunctionsOptions = {}) => new masamune.FunctionsData({ id: "workflow_scheduler", func: require("./functions/workflow_scheduler"), options: options }),
} as const;
