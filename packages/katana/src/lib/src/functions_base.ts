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
export interface DatabasePathFunctionsOptions extends FunctionsOptions {
    /**
     * Specify the path to the target database.
     * 
     * 対象のデータベースのパスを指定します。
     */
    path?: string | undefined | null;

    /**
     * Specifies the database.
     * 
     * データベースを指定します。
     */
    database?: string | undefined | null;

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
    /**
     * Determines whether Firebase AppCheck is enforced.
     * When true, requests with invalid tokens autorespond with a 401
     * (Unauthorized) error.
     * When false, requests with invalid tokens set event.app to undefiend.
     * 
     * Firebase AppCheckを強制するかどうかを指定します。
     * 
     * trueの場合、無効なトークンを持つリクエストは401（Unauthorized）エラーで応答します。
     * falseの場合、無効なトークンを持つリクエストはevent.appをundefinedに設定します。
     */
    enforceAppCheck?: boolean | null;
    /**
     * Determines whether Firebase App Check token is consumed on request. Defaults to false.
     *
     * @remarks
     * Set this to true to enable the App Check replay protection feature by consuming the App Check token on callable
     * request. Tokens that are found to be already consumed will have request.app.alreadyConsumed property set true.
     *
     *
     * Tokens are only considered to be consumed if it is sent to the App Check service by setting this option to true.
     * Other uses of the token do not consume it.
     *
     * This replay protection feature requires an additional network call to the App Check backend and forces the clients
     * to obtain a fresh attestation from the chosen attestation providers. This can therefore negatively impact
     * performance and can potentially deplete your attestation providers' quotas faster. Use this feature only for
     * protecting low volume, security critical, or expensive operations.
     *
     * This option does not affect the enforceAppCheck option. Setting the latter to true will cause the callable function
     * to automatically respond with a 401 Unauthorized status code when request includes an invalid App Check token.
     * When request includes valid but consumed App Check tokens, requests will not be automatically rejected. Instead,
     * the request.app.alreadyConsumed property will be set to true and pass the execution to the handler code for making
     * further decisions, such as requiring additional security checks or rejecting the request.
     * 
     * Firebase AppCheckトークンをリクエスト時に消費するかどうかを指定します。デフォルトはfalseです。
     *
     * @remarks
     * これをtrueに設定すると、Callable関数のリクエストでAppCheckトークンを消費することで、
     * AppCheckのリプレイ保護機能が有効になります。既に消費されたトークンが検出された場合、
     * request.app.alreadyConsumedプロパティがtrueに設定されます。
     *
     * トークンは、このオプションをtrueに設定してAppCheckサービスに送信された場合にのみ
     * 消費されたとみなされます。トークンの他の使用方法では消費されません。
     *
     * このリプレイ保護機能は、AppCheckバックエンドへの追加のネットワークコールを必要とし、
     * クライアントに選択された認証プロバイダーから新しい認証を取得することを強制します。
     * そのため、パフォーマンスに悪影響を与える可能性があり、認証プロバイダーのクォータを
     * より早く消費する可能性があります。この機能は、低ボリュームのセキュリティ重要な
     * 操作や高コストな操作の保護にのみ使用してください。
     *
     * このオプションは、enforceAppCheckオプションには影響しません。後者をtrueに設定すると、
     * リクエストに無効なAppCheckトークンが含まれている場合、Callable関数は自動的に
     * 401 Unauthorizedステータスコードで応答します。有効だが消費済みのAppCheckトークンが
     * 含まれているリクエストは自動的には拒否されません。代わりに、request.app.alreadyConsumed
     * プロパティがtrueに設定され、追加のセキュリティチェックやリクエストの拒否など、
     * さらなる判断を行うためにハンドラーコードに実行が渡されます。
     */
    consumeAppCheckToken?: boolean | null;
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

    /**
     * Specifies the service account.
     * 
     * サービスアカウントを指定します。
     */
    serviceAccount?: string | undefined;

    /**
     * Specifies the Firestore database IDs.
     * 
     * FirestoreのデータベースIDを指定します。
     */
    firestoreDatabaseIds?: string[] | undefined;

    /**
     * Specifies the Storage bucket IDs.
     * 
     * StorageのバケットIDを指定します。
     */
    storageBucketIds?: string[] | undefined;
}