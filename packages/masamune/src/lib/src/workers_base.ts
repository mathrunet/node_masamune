import { Hono } from "hono";

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
    abstract build(): Hono;
}

/**
 * Specifies the options for the process.
 * 
 * 処理のオプションを指定します。
 */
export interface WorkersOptions {
}