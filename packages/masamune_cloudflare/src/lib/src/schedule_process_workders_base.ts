import { Hono } from "hono";
import { WorkersBase, WorkersOptions } from "./workers_base";

/**
 * Base class for defining Workers data for periodic scheduled execution.
 *
 * 定期スケジュール実行用のWorkersのデータを定義するためのベースクラス。
 */
export abstract class ScheduleProcessWorkdersBase extends WorkersBase {
    /**
     * Base class for defining Workers data for periodic scheduled execution.
     *
     * 定期スケジュール実行用のWorkersのデータを定義するためのベースクラス。
     */
    constructor(options: WorkersOptions = {}) {
        super({ options: options });
    }

    /**
     * Specify the actual contents of the scheduled process.
     *
     * 実際のスケジュール処理の中身を指定します。
     */
    abstract process(
        event: ScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ): Promise<void>;

    data: { [key: string]: any } = {};
    build(defaultOptions: WorkersOptions = {}): Hono {
        return new Hono();
    }
}
