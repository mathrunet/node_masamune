import { Hono } from "hono";
import { WorkersAuthAdapterBase } from "./workers_auth_adapter_base";
import { WorkersRuleAdapterBase } from "./workers_rule_adapter_base";
import { RulesConfig } from "./rules/rules_loader";

/**
 * Define Function data for Cloudflare Workers.
 * 
 * Write code to generate Cloudflare Workers at `build`.
 * 
 * Cloudflare Workers用のFunctionのデータを定義を行うためのベースクラス。
 * 
 * `build`にてCloudflare Workersを生成するためのコードを記述します。
 */
export abstract class WorkersBase {
    /**
     * Define Function data for Cloudflare Workers.
     * 
     * Write code to generate Cloudflare Workers at `build`.
     * 
     * Cloudflare Workers用のFunctionのデータを定義を行うためのベースクラス。
     * 
     * `build`にてCloudflare Workersを生成するためのコードを記述します。
     */
    constructor({
        path,
        func,
        data = {},
        options,
    }: {
        path?: string | undefined | null,
        func?: ((
            hono: Hono,
            options: WorkersOptions,
            data: { [key: string]: any },
        ) => Hono) | undefined | null,
        data?: { [key: string]: any } | undefined | null,
        options?: WorkersOptions | undefined | null,
    }) {
        this.path = path ?? "";
        this.func = func;
        this.data = data ?? {};
        this.options = options ?? {};
    }

    /**
     * @param path 
     * Specify the API path to the Cloudflare Workers.
     * 
     * Cloudflare WorkersのAPIパスを指定します。
     */
    readonly path: string;

    /**
     * @param func 
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     */
    readonly func: ((
        hono: Hono,
        options: WorkersOptions,
        data: { [key: string]: any }
    ) => Hono) | undefined | null;

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
    readonly options: WorkersOptions;

    /**
     * Write code to generate Cloudflare Workers.
     * 
     * Cloudflare Workersを生成するためのコードを記述します。
     */
    abstract build(defaultOptions?: WorkersOptions): Hono;

    /**
     * Merge default options and worker options.
     *
     * デフォルトオプションとWorkerのオプションをマージします。
     */
    protected resolveOptions(defaultOptions: WorkersOptions = {}): WorkersOptions {
        return resolveWorkersOptions(defaultOptions, this.options);
    }

    /**
     * Apply authentication middleware.
     *
     * 認証ミドルウェアを適用します。
     */
    protected applyAuthentication(hono: Hono, options: WorkersOptions): Hono {
        if (options.auth) {
            hono.use("*", options.auth.build());
        }
        return hono;
    }

    /**
     * Apply rules middleware.
     *
     * rulesミドルウェアを適用します。
     */
    protected applyRules(hono: Hono, options: WorkersOptions): Hono {
        if (isWorkersRuleAdapter(options.rules)) {
            hono.use("*", options.rules.build());
        }
        return hono;
    }
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface WorkersOptions {
    /**
     * Authentication adapter.
     *
     * 認証アダプター。
     */
    auth?: WorkersAuthAdapterBase | null | undefined;

    /**
     * Rules adapter or rules.json configuration.
     *
     * rulesアダプター、またはrules.json設定。
     */
    rules?: WorkersRulesOption | null | undefined;
}

/**
 * Rules option for Workers.
 *
 * Workers用rulesオプション。
 */
export type WorkersRulesOption = WorkersRuleAdapterBase | RulesConfig;

/**
 * Merge Workers options.
 *
 * Workersのオプションをマージします。
 */
export function resolveWorkersOptions(
    defaultOptions: WorkersOptions = {},
    options: WorkersOptions = {},
): WorkersOptions {
    const defaultAuth = defaultOptions.auth;
    const auth = options.auth;
    const defaultRules = defaultOptions.rules;
    const rules = options.rules;
    return {
        ...defaultOptions,
        ...options,
        auth: auth === undefined
            ? defaultAuth
            : auth,
        rules: rules === undefined
            ? defaultRules
            : rules,
    };
}

/**
 * Returns true when rules option is a middleware adapter.
 *
 * rulesオプションがミドルウェアアダプターの場合はtrueを返します。
 */
export function isWorkersRuleAdapter(
    rules: WorkersRulesOption | null | undefined,
): rules is WorkersRuleAdapterBase {
    return !!rules && typeof (rules as WorkersRuleAdapterBase).build === "function";
}

/**
 * Returns true when rules option is rules.json configuration.
 *
 * rulesオプションがrules.json設定の場合はtrueを返します。
 */
export function isRulesConfig(
    rules: WorkersRulesOption | null | undefined,
): rules is RulesConfig {
    return !!rules && typeof (rules as RulesConfig).version === "string" &&
        typeof (rules as RulesConfig).rules === "object" &&
        (rules as RulesConfig).rules !== null;
}
