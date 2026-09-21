import { nativeVectorSpec, normalizeVectorValue } from "@mathrunet/masamune_cloudflare";
import { connect, Config } from "@tidbcloud/serverless";
import { HttpError } from "./http_error";

/** Builder・migration・Workerが共有するスキーマ契約。 */
export interface SchemaManifest {
  version: "1";
  tables: SchemaTable[];
  sourceHash?: string;
}
export interface SchemaTable {
  database: string;
  table: string;
  columns: { name: string; sqlType: string; nullable: boolean; vectorMetric?: "cosine" | "euclidean" }[];
  primaryKey: string[];
  vectorFields: string[];
  indexes?: { name: string; columns: string[]; unique: boolean }[];
}
export interface DirectOptions {
  host: string;
  username: string;
  password: string;
  manifest: SchemaManifest;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** manifest外の識別子をSQLへ渡さない。資格情報はWorkerだけに保持する。 */
export class TidbDirectClient {
  constructor(private readonly options: DirectOptions) {
    if (options.manifest.version !== "1" || !Array.isArray(options.manifest.tables)) {
      throw new HttpError(500, "Invalid schema manifest.");
    }
    if (!options.host || !options.username || !options.password) {
      throw new HttpError(500, "Missing TiDB direct credentials.");
    }
    if (!Number.isSafeInteger(options.timeoutMs ?? 15000) || (options.timeoutMs ?? 15000) <= 0) {
      throw new HttpError(500, "Invalid TiDB timeout.");
    }
  }

  table(database: string, table: string): SchemaTable {
    const matches = this.options.manifest.tables.filter(t => t.database === database && t.table === table);
    if (matches.length !== 1) throw new HttpError(400, "Table is not present in schema manifest.");
    const schema = matches[0];
    quoteIdentifier(schema.database);
    quoteIdentifier(schema.table);
    for (const column of schema.columns) quoteIdentifier(column.name);
    if (new Set(schema.columns.map(c => c.name)).size !== schema.columns.length) {
      throw new HttpError(500, "Duplicate schema column.");
    }
    return schema;
  }

  column(schema: SchemaTable, name: string): string {
    if (!schema.columns.some(c => c.name === name)) throw new HttpError(400, "Column is not present in schema manifest.");
    return quoteIdentifier(name);
  }

  async execute(database: string, sql: string, parameters: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (!this.options.manifest.tables.some(t => t.database === database)) {
      throw new HttpError(400, "Database is not present in schema manifest.");
    }
    const connection = this.connection(database);
    try {
      return await connection.execute(sql, parameters) as Record<string, unknown>[];
    } catch (error) {
      // ドライバの例外にはSQL・値が含まれ得るため外部へ渡さない。
      throw new HttpError(502, "TiDB query failed; mutation outcome may be unknown.");
    }
  }

  /** experimentalなtransactionを直列化し、commit失敗時は結果不明として返す。 */
  async transaction<T>(database: string, action: (client: Pick<TidbDirectClient, "table" | "column" | "execute">) => Promise<T>): Promise<T> {
    if (!this.options.manifest.tables.some(t => t.database === database)) throw new HttpError(400, "Database is not present in schema manifest.");
    const connection = this.connection(database);
    const tx = await connection.begin().catch(() => { throw new HttpError(502, "TiDB transaction could not start."); });
    let pending = Promise.resolve();
    let failed = false;
    let commitStarted = false;
    try {
      const result = await action({
        table: this.table.bind(this), column: this.column.bind(this),
        execute: (selected, sql, parameters = []) => {
          if (selected !== database) return Promise.reject(new HttpError(400, "Transaction database mismatch."));
          const run = pending.then(async () => {
            if (failed) throw new HttpError(502, "Transaction already failed.");
            try { return await tx.execute(sql, parameters) as Record<string, unknown>[]; }
            catch { failed = true; throw new HttpError(502, "TiDB transaction query failed."); }
          });
          pending = run.then(() => {}, () => {});
          return run;
        },
      });
      await pending;
      if (failed) throw new HttpError(502, "TiDB transaction query failed.");
      commitStarted = true;
      await tx.commit();
      return result;
    } catch (error) {
      await pending;
      if (!commitStarted) {
        try { await tx.rollback(); } catch { /* 失敗を成功へ変換せず、元のエラーを返す。 */ }
      }
      if (commitStarted) throw new HttpError(502, "TiDB commit failed; mutation outcome may be unknown.");
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "TiDB transaction failed.");
    }
  }

  private connection(database: string) {
    const config: Config = {
      host: this.options.host,
      username: this.options.username,
      password: this.options.password,
      database,
      debug: false,
      fetch: async (url, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
        try {
          const response = await (this.options.fetch ?? fetch)(url, { ...init, signal: controller.signal });
          const body = await response.arrayBuffer();
          return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        } finally { clearTimeout(timer); }
      },
    };
    return connect(config);
  }
}

export function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(value)) throw new HttpError(400, "Invalid SQL identifier.");
  return `\`${value}\``;
}

/** DECIMALをNumberへ丸めず、整数は安全な範囲だけ変換する。 */
export function decodeDirectRow(row: Record<string, unknown>, schema: SchemaTable): Record<string, unknown> {
  return Object.fromEntries(schema.columns.filter(c => Object.hasOwn(row, c.name)).map(column => {
    let value = row[column.name];
    if (value != null) {
      const type = column.sqlType.toUpperCase();
      if (/^(?:BOOL|BOOLEAN|TINYINT\(1\))$/.test(type)) {
        if (![true, false, 0, 1, "0", "1"].includes(value as never)) throw new HttpError(502, "Invalid boolean value.");
        value = value === true || value === 1 || value === "1";
      } else if (/^(?:BIGINT|INT|INTEGER|SMALLINT|MEDIUMINT)(?:\b|\()/.test(type)) {
        const number = Number(value);
        value = Number.isSafeInteger(number) ? number : String(value);
      } else if (/^(?:DECIMAL|NUMERIC)(?:\b|\()/.test(type)) {
        value = String(value);
      } else if ((type === "JSON" || type.startsWith("VECTOR(")) && typeof value === "string") {
        try { value = JSON.parse(value); } catch { throw new HttpError(502, "Invalid structured value."); }
      }
    }
    const spec = nativeVectorSpec(column.name, column.sqlType, column.vectorMetric);
    if (spec && value != null) {
      try { value = { "@type": "ModelVectorValue", "@source": "server", "@vector": normalizeVectorValue(value, spec), "@measure": spec.metric }; }
      catch { throw new HttpError(502, "Invalid stored vector."); }
    }
    return [column.name, value];
  }));
}
