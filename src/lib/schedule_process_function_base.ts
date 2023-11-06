import * as functions from "firebase-functions";
import { FunctionsBase } from "./functions_base";

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
    constructor() {
        super();
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
     * 
     * @param options 
     * Options passed to Functions.
     * 
     * Functionsに渡されたオプション。
     */
    abstract process(options: Record<string, any>): Promise<void>;

    data: { [key: string]: string } = {};
    build(regions: string[], data: { [key: string]: string }): Function {
        return functions.runWith({
            timeoutSeconds: this.timeoutSeconds,
        }).region(...regions).pubsub.schedule(this.schedule).onRun(async (event) => {
            const config = functions.config();
            return this.process(config);
        });
    }
}