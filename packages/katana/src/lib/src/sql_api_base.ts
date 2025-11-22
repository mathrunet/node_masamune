
/**
 * Base class for the API's model.
 * 
 * Inherit this to create a model for the API.
 * 
 * APIのモデルの基底クラス。
 * 
 * これを継承してAPIのモデルを作成します。
 */
export abstract class SqlApiModelBase {
    /**
     * Convert [SqlApiModelBase] to a format that can be handled by Json.
     * 
     * [SqlApiModelBase]をJsonで扱える形式に変換します。
     * 
     * @returns {{ [key: string]: any }}
     * Json format.
     * 
     * Json形式。
     */
    abstract toJson(): { [key: string]: any };
}

/**
 * Base class for the API.
 * 
 * Inherit this to create an API.
 * 
 * APIの基底クラス。
 * 
 * これを継承してAPIを作成します。
 */
export abstract class SqlApiBase<T extends SqlApiModelBase> {
    /**
     * Name of table to be used.
     * 
     * 使用するテーブル名。
     */
    abstract table: string;

    /**
     * Get the data from the table.
     * 
     * テーブルからデータを取得します。
     * 
     * @param {{ [key: string]: any }[]} where 
     * Specify the conditions for retrieving data from Sql.
     * 
     * Sqlからデータを取得するための条件を指定します。
     * 
     * @returns {Promise<T[]>}
     * Data from the table.
     * 
     * テーブルからのデータ。
     */
    abstract get(where: { [key: string]: any }[]): Promise<T[]>;

    /**
     * Get the number of records matching [where].
     * 
     * [where]に一致するレコードの数を取得します。
     * 
     * @param {{ [key: string]: any }[]} where 
     * Specify the conditions for retrieving data from Sql.
     * 
     * Sqlからデータを取得するための条件を指定します。
     * 
     * @returns {Promise<number>}
     * Number of records matching [where].
     * 
     * [where]に一致するレコードの数。
     */
    abstract count(where: { [key: string]: any }[]): Promise<number>;

    /**
     * Add data to the table.
     * 
     * テーブルにデータを追加します。
     * 
     * @param {{ [key: string]: any }} value
     * Data to be added to the table.
     * 
     * テーブルに追加するデータ。
     * 
     * @param {{ [key: string]: any }[]} where 
     * Specify the conditions for adding data from Sql.
     * 
     * Sqlからデータを追加するための条件を指定します。
     * 
     * @returns {Promise<T>}
     * Data added to the table.
     * 
     * テーブルに追加されたデータ。
     */
    abstract post(value: { [key: string]: any }, where: { [key: string]: any }[]): Promise<T>;

    /**
     * Update the data in the table.
     * 
     * テーブルのデータを更新します。
     * 
     * @param {{ [key: string]: any }} value
     * Data to be updated in the table.
     * 
     * テーブルの更新するデータ。
     * 
     * @param {{ [key: string]: any }[]} where 
     * Specify the conditions for updating data from Sql.
     * 
     * Sqlからデータを更新するための条件を指定します。
     * 
     * @returns {Promise<T>}
     * Updated data for the table.
     * 
     * テーブルの更新されたデータ。
     */
    abstract put(value: { [key: string]: any }, where: { [key: string]: any }[]): Promise<T>;

    /**
     * Deletes data from the table.
     * 
     * テーブルからデータを削除します。
     * 
     * @param { [key: string]: any }[] where 
     * Specify the conditions for deleting data from Sql.
     * 
     * Sqlからデータを削除するための条件を指定します。
     * 
     * @returns {Promise<void>}
     */
    abstract delete(where: { [key: string]: any }[]): Promise<void>;

    /**
     * 
     * @param {string} table
     * Table Name.
     * 
     * テーブル名。
     * 
     * @param {"GET" | "POST" | "DELETE" | "PUT" | "COUNT"} method
     * Specify the method to be used.
     * 
     * 使用するメソッドを指定します。
     * 
     * @param {{ [key: string]: any }[]} where
     * Specify the conditions for retrieving data from Sql.
     * 
     * Sqlからデータを取得するための条件を指定します。
     * 
     * @param {{ [key: string]: any } | undefined} value
     * Data to be added to the table.
     * 
     * テーブルに追加するデータ。
     *  
     * @returns {Promise<{ [key: string]: any }[] | number | null>}
     * When [null] is returned, the condition is not met.
     * 
     * Otherwise, it returns the retrieved data.
     * 
     * [null]が返却されたときは条件に一致しないとき。
     * 
     * その他の場合は取得されたデータを返します。
     */
    async process({
        table,
        method,
        where,
        value,
    }: {
        table: string,
        method: "GET" | "POST" | "DELETE" | "PUT" | "COUNT",
        where?: { [key: string]: any }[] | undefined,
        value?: { [key: string]: any } | undefined,
        }): Promise<{ [key: string]: any }[] | number | null> {
        if (table !== this.table) {
            return null;
        }
        switch (method) {
            case "GET": {
                return (await this.get(where ?? [])).map((e) => { return e.toJson() });
            }
            case "COUNT": {
                await this.count(where ?? []);
                return [];
            }
            case "POST": {
                return [(await this.post(value ?? {}, where ?? [])).toJson()];
            }
            case "PUT": {
                return [(await this.put(value ?? {}, where ?? [])).toJson()];
            }
            case "DELETE": {
                await this.delete(where ?? []);
                return [];
            }
        }
    }
}