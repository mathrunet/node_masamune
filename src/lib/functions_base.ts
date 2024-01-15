import { MemoryOption } from "firebase-functions/v2";


/**
 * Define Function data for FirebaseFunctions.
 * 
 * Write code to generate FirebaseFunctions at `build`.
 * 
 * FirebaseFunctions用のFunctionのデータを定義を行うためのベースクラス。
 * 
 * `build`にてFirebaseFunctionsを生成するためのコードを記述します。
 */
export abstract class FunctionsBase {
    /**
     * Define Function data for FirebaseFunctions.
     * 
     * Write code to generate FirebaseFunctions at `build`.
     * 
     * FirebaseFunctions用のFunctionのデータを定義を行うためのベースクラス。
     * 
     * `build`にてFirebaseFunctionsを生成するためのコードを記述します。
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
            options: FunctionsOptions,
            data: { [key: string]: string },
        ) => Function,
        data?: { [key: string]: string },
        options?: FunctionsOptions | undefined | null,
    }) {
        this.id = id;
        this.func = func;
        this.data = data;
        this.options = options ?? {
            timeoutSeconds: 60,
            memory: "256MiB",
            minInstances: 0,
            concurrency: 80,
        };
    }

    /**
     * @param id 
     * Describe the method names used in Functions.
     * 
     * Functionsで利用されるメソッド名を記述します。
     */
    readonly id: string;

    /**
     * @param func 
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     */
    readonly func: (
        region: string[],
        options: FunctionsOptions,
        data: { [key: string]: string }
    ) => Function;

    /**
     * Specify the data to be passed to the process.
     * 
     * 処理に渡すデータを指定します。
     */
    readonly data: { [key: string]: string };

    /**
     * Specify processing options.
     * 
     * 処理のオプションを指定します。
     */
    readonly options: FunctionsOptions;

    /**
     * Write code to generate FirebaseFunctions.
     * 
     * FirebaseFunctionsを生成するためのコードを記述します。
     */
    abstract build(region: string[]): Function;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface SchedulerFunctionsOptions extends FunctionsOptions {
    /**
     * Specifies the schedule.
     * * Cron format and AppEngine format are available.
     * * For Cron format, specify as `5 11 * * *`.
     * * For AppEngine format, specify as `every 1 minutes`.
     * 
     * スケジュールを指定します。
     * * Cron形式とAppEngine形式で指定可能です。
     * * Cron形式の場合は、`5 11 * * *`のように指定します。
     * * AppEngine形式の場合は、`every 1 minutes`のように指定します。
     */
    schedule?: string | undefined | null;
}


/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface PubsubFunctionsOptions extends FunctionsOptions {
    /**
     * Specifies the topic.
     * You can create a `purchasing` topic in GCP's pub/sub and set the principal to "google-play-developer-notifications@system.gserviceaccount.com" to receive notifications.
     * 
     * トピックを指定します。
     * GCPのpub/subに`purchasing`のトピックを作成しプリンシパルに「google-play-developer-notifications@system.gserviceaccount.com」を設定することで通知を受け取ることができるようになります。
     */
    topic?: string | undefined | null;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface FunctionsOptions {
    /**
     * Specifies the timeout period.
     * 
     * タイムアウト時間を指定します。
     */
    timeoutSeconds?: number | undefined;

    /**
     * Specifies the memory.
     * 
     * メモリを指定します。
     */
    memory?: MemoryOption | undefined;

    /**
     * Specifies the minInstances.
     * 
     * minInstancesを指定します。
     */
    minInstances?: number | undefined;

    /**
     * Specifies the maxInstances.
     * 
     * maxInstancesを指定します。
     */
    maxInstances?: number | undefined | null;

    /**
     * Specifies the concurrency.
     * 
     * concurrencyを指定します。
     */
    concurrency?: number | undefined;
}
