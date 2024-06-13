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
        id?: string | undefined | null,
        func?: ((
            region: string[],
            options: FunctionsOptions,
            data: { [key: string]: any },
        ) => Function) | undefined | null,
        data?: { [key: string]: any } | undefined | null,
        options?: FunctionsOptions | undefined | null,
    }) {
        this.id = options?.name ?? id ?? "";
        this.func = func;
        this.data = data ?? {};
        this.options = options ?? {
            timeoutSeconds: 60,
            memory: "256MiB",
            minInstances: 0,
            concurrency: 80,
            maxInstances: 100,
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
    readonly func: ((
        region: string[],
        options: FunctionsOptions,
        data: { [key: string]: any }
    ) => Function) | undefined | null;

    /**
     * Specify the data to be passed to the process.
     * 
     * 処理に渡すデータを指定します。
     */
    readonly data: { [key: string]: any };

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

    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | null;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface PathFunctionsOptions extends FunctionsOptions {
    /**
     * Specify the path to the target database.
     * 
     * 対象のデータベースのパスを指定します。
     */
    path?: string | undefined | null;

    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | null;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface RelationPathFunctionsOptions extends FunctionsOptions {
    /**
     * Specify the path to the target database.
     * 
     * 対象のデータベースのパスを指定します。
     */
    path?: string | undefined | null;

    /**
     * 
     * @param path 
     * @returns 
     */
    relation?: (path: string) => string | undefined | null;

    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | null;
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

    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | null;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface HttpFunctionsOptions extends FunctionsOptions {
    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | string[] | null;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface StorageFunctionsOptions extends FunctionsOptions {
    /**
     * Specifies an alternate region.
     * 
     * 代替のリージョンを指定します。
     */
    region?: string | null;
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
    maxInstances?: number | undefined;

    /**
     * Specifies the concurrency.
     * 
     * concurrencyを指定します。
     */
    concurrency?: number | undefined;

    /**
     * Change the method name to something you prefer.
     * 
     * メソッド名をお好みのものに変更します。
     */
    name?: string | undefined;
}
