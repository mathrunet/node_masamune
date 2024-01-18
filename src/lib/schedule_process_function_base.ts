import * as functions from "firebase-functions/v2";
import { FunctionsBase, SchedulerFunctionsOptions } from "./functions_base";

/**
 * Base class for defining the data of Functions for periodic scheduled execution.
 * 
 * 定期スケジュール実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class ScheduleProcessFunctionBase extends FunctionsBase {
    /**
     * Base class for defining the data of Functions for periodic scheduled execution.
     * 
     * 定期スケジュール実行用のFunctionのデータを定義するためのベースクラス。
     */
    constructor({
        id,
        func,
        data = {},
        options,
    }: {
        id: string,
        func: (
            region: string[],
            options: SchedulerFunctionsOptions,
            data: { [key: string]: string },
        ) => Function,
        data?: { [key: string]: string },
        options?: SchedulerFunctionsOptions | undefined | null,
    }) {
        super({ id: id, func: func, data: data, options: options });
    }

    /** 
     * Specify the schedule to execute the process in cron format.
     * 
     * 処理を実行するスケジュールをcron形式で指定します。
     * 
     * https://firebase.google.com/docs/functions/schedule-functions
     */
    abstract schedule: string;

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     */
    abstract process(): Promise<void>;

    data: { [key: string]: string } = {};
    build(regions: string[]): Function {
        const options = this.options as SchedulerFunctionsOptions | undefined | null;
        return functions.scheduler.onSchedule(
            {
                schedule: options?.schedule ?? this.schedule,
                region: options?.region ?? regions[0],
                timeoutSeconds: options?.timeoutSeconds,
                memory: options?.memory,
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
            },
            async (event) => {
                return this.process();
            },
        );
    }
}