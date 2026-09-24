# Migrating to Direct TiDB Connections (3.6.0)

This change does not automatically update existing Workers or production databases. Passing legacy Data Service settings to the new package will not work.

## Generation and Connection Settings

1. Replace `@TidbDataService` with `@TidbSchema` and `dataServiceDirPath` with `schemaDirPath`, which defaults to `tidb/schema`. Use `TidbSchemaColumn`/`TidbSchemaTable` for server-owned columns and tables. `indexes` maps non-UNIQUE index names to column lists. Custom endpoints and GET cache settings have been removed. Implement any required logic in authenticated Worker functions.
2. Run `katana code generate`. build_runner manages per-input `.tidb_schema` files, and the CLI merges them into `tidb/schema/schema.json` after success. `katana code watch` also merges after successful builds. If running build_runner directly, finish generation through the CLI. The merged output includes unchanged models and database prefixes and excludes deleted inputs.
3. Have an administrator create dev/prod databases and verify public connectivity. `katana apply --flavor <dev|prod>` can create a dedicated migration SQL user through the TiDB Cloud SQL Users management API when no migration SQL credentials exist. It never creates a database or changes public connectivity. Runtime DML credentials remain separate.

```yaml
# katana.yaml
cloudflare:
  tidb:
    enable: true
    cluster_id: {dev: "target-cluster", prod: "target-cluster"}
    host: {dev: "connection-host", prod: "connection-host"}
    database: {dev: dev_main, prod: main}
    # Select explicitly when the management API key cannot manage SQL users.
    migration_auth: {dev: ticloud_oauth, prod: api_key}
    migration_auth_profile: {dev: default}
    schema: tidb/schema/schema.json
    migrations: tidb/migrations
    prefixes: [dev]
```

The existing `katana_secrets.yaml` `cloudflare.tidb.migration_username` / `migration_password` values take precedence on first use. After an SQL identity check, Katana stores them under `cloudflare.tidb.migration_users.<flavor>` in the ignored, mode-0600 `cloudflare/tidb.yaml`. If no SQL credentials exist, the default `api_key` mode uses `TIDBCLOUD_PUBLIC_KEY` / `TIDBCLOUD_PRIVATE_KEY` from Samurai password injection (or existing `cloudflare.tidb.public_key` / `private_key`) to create a `role_admin` SQL user for the selected cluster. The API keys authenticate only the management API; they are not SQL credentials. When a management key cannot see or create SQL users, set `migration_auth` explicitly to `ticloud_oauth` for that flavor. On macOS, Katana reads the existing `ticloud` OAuth profile from Keychain and sends its bearer token only in HTTPS headers. Other platforms must use an authorized API key or existing SQL credentials. Katana never silently switches authentication after an API failure. The generated SQL password is written as `pending` to `cloudflare/tidb.yaml` before the create-only API call, so retries reuse it without rotating or overwriting an unknown same-name user. Successful SQL `CURRENT_USER()` and administrative grant checks mark it `active`. A saved pending record is reconciled on retry. Management credentials and the migration password are never passed on command-line arguments or to Worker secrets.

`katana migrate` reads the same `cloudflare/tidb.yaml` entry and can also import legacy migration SQL credentials. It checks the actual SQL identity. Migration credentials are passed to the local Node administrative process through standard input only. Migrations record the SQL username as part of the connection identity and compare it with `CURRENT_USER()`. Dev and prod are selected explicitly with `--flavor`; preparing dev does not create a prod user. SQL Users management requires the appropriate TiDB Cloud organization/project ownership, while SQL DDL and user/role grants require separate database privileges. If either check fails, inspect the non-secret HTTP status or SQL failure and resolve that permission before retrying. A change to the SQL username is not implicitly applied to existing migration history.

## Applying Database Changes and Switching Over

```sh
katana migrate diff --flavor dev
katana migrate generate --flavor dev --version 20260920_initial
katana migrate apply --flavor dev
# Run after checking the SQL, snapshot, and target
katana migrate apply --flavor dev --apply
katana migrate status --flavor dev
katana apply --flavor dev
```

`apply`/`mark` are read-only without `--apply`. Migration files are saved as `<migrations>/<flavor>/<database>/<version>.{json,sql}` and should be version-controlled in Git. The environment, cluster, host, database, SQL user, SQL hash, and snapshot must match. The SHA-256 of the complete SQL plan is verified separately from the manifest source hash.

An existing database can be adopted with `katana migrate mark --flavor dev --apply` only if its final schema matches exactly. `apply` targets the latest single version by default. For a new environment with multiple pending versions, specify `--version` and apply each version from oldest to newest. Use `status` to inspect the actual schema and database-side ledger.

Automatic DDL is limited to CREATE TABLE, nullable column additions, and ordinary index additions. Removing existing columns, changing their types/nullability, changing existing indexes, and adding NOT NULL/UNIQUE constraints are rejected. CHECK constraints, defaults, generated columns, prefix indexes, and similar changes are also outside automatic migration support. These require administrator-specific procedures that preserve existing data.

Switch over in database → Worker → app order. Supply the shared schema to the Worker's `Functions.tidb`. Re-running `katana apply` does not duplicate registration or execute DDL. Deploying the Worker after configuring connections is a separate step. Once the new path works, explicitly identify and remove obsolete Data Apps, Data API keys, and generated directories. The new CLI does not bulk-delete legacy resources.

## Handling Interruptions

`_masamune_migrations` stores the version, hash, progress, and snapshot; `_masamune_migration_lock` stores the execution owner. If DDL succeeds but the ledger update fails, the actual schema is checked and execution resumes without resending the same DDL.

A lost DDL response does not prove that server processing has completed, so the persistent lock remains. There is no automatic timeout-based takeover. After an administrator verifies the execution process, completion of TiDB DDL, and the actual schema, release the lock belonging to that owner and rerun the same version. Do not bypass validation by manually editing SQL/JSON or deleting the ledger.
