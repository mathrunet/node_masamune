import { DatabaseSync } from "node:sqlite";
import type { D1Binding, D1Session, D1Statement, D1Result, SchemaManifest } from "../src/lib/types";
export const manifest: SchemaManifest = {
  version: "1", dialect: "sqlite", tables: [{
    database: "main", table: "items", primaryKey: ["id"], vectorFields: [], columns: [
      { name: "id", sqlType: "TEXT", nullable: false }, { name: "name", sqlType: "TEXT", nullable: true }, { name: "value", sqlType: "INTEGER", nullable: true }, { name: "flag", sqlType: "BOOLEAN", nullable: true }, { name: "tags", sqlType: "JSON", nullable: true }, { name: "created_at", sqlType: "INTEGER", nullable: true }, { name: "updated_at", sqlType: "INTEGER", nullable: true }]
  }]
};
export class SqliteBinding implements D1Binding {
  readonly db = new DatabaseSync(":memory:"); readonly bookmarks: (string | undefined)[] = []; version = 0;
  constructor() { this.db.exec('CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, name TEXT, value INTEGER CHECK(value >= 0), flag INTEGER, tags TEXT, created_at INTEGER, updated_at INTEGER)'); }
  withSession(bookmark?: string): D1Session {
    this.bookmarks.push(bookmark);
    let queried = false;
    const prepare = (sql: string): D1Statement => { let values: unknown[] = []; return { bind(...v) { values = v; return this; }, all: async () => { const rows = this.db.prepare(sql).all(...values as never[]); queried = true; this.version++; return { success: true, results: rows }; } }; };
    return {
      prepare, getBookmark: () => queried ? String(this.version).padStart(10, "0") : null, batch: async (statements) => {
        this.db.exec("BEGIN"); try { const result: D1Result[] = []; for(const s of statements) result.push(await s.all()); this.db.exec("COMMIT"); return result; } catch(e) { this.db.exec("ROLLBACK"); throw e; }
      }
    };
  }
}
