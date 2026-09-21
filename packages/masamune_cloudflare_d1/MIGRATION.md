# D1 Schema and Migrations

Use `katana code generate` or `watch` with `@D1Schema` from `masamune_model_d1_annotation` and its builder to generate `d1/schema/schema.json`. Per-input `.d1_schema` files are merged, unchanged models are retained, and deleted inputs are excluded. Supports SQLite TEXT / INTEGER / REAL / BOOLEAN / JSON and non-UNIQUE indexes. The id is a TEXT NOT NULL primary key.

Example `katana.yaml` configuration:

```yaml
cloudflare:
  d1:
    enable: true
    account_id: <32-character-account-ID>
    database_id:
      dev: ""
      prod: ""
    database_name:
      dev: example-dev
      prod: example-prod
    database:
      dev: dev_main
      prod: main
    binding: MASAMUNE_D1
    schema: d1/schema/schema.json
    prefixes: [dev]
    migrations:
      dev: d1/migrations/dev
      prod: d1/migrations/prod
```

Prepare an initialized Worker and the corresponding Node package, then run `katana apply --flavor dev` with an explicit flavor. Reuse or create a database with a dedicated name within the account, and configure the displayed database ID for the same flavor. This operation does not execute DDL. Verify resource creation permissions beforehand.

```sh
katana code generate
katana migrate status --backend d1 --flavor dev
katana migrate diff --backend d1 --flavor dev
katana migrate generate --backend d1 --flavor dev --version 2026092001_initial
katana migrate apply --backend d1 --flavor dev --version 2026092001_initial
katana migrate apply --backend d1 --flavor dev --version 2026092001_initial --apply
```

apply/mark default to dry-run mode. `--local` uses Wrangler's local database. Migration JSON records the account ID, database UUID, logical database, flavor, previous schema, target manifest, SQL, and hashes. Generate versions later than existing versions and apply pending versions from oldest to newest.

Ordinary diffs allow only new tables, nullable columns, and non-UNIQUE indexes. Deletions, type changes, and changes to NOT NULL/UNIQUE constraints on existing columns are rejected. Breaking changes require a separate plan covering data migration and backups.

apply guards the previous sqlite_master state and applies DDL and `_masamune_migrations` history in the same Wrangler migration transaction. It validates SQL/definition hashes, the target database, and application order. Failed transactions are rolled back. If a response is lost, use status to recheck the ledger and actual schema instead of guessing changes and regenerating the migration. Reapplying the same version exits as already applied when the history matches.

For a manually applied version, `mark --version ... --apply` verifies that the actual schema matches the target and records the history. mark still validates the target and hashes. Migration credentials do not need to be supplied to the Worker; administrative operations use Wrangler authentication.

## Vectorize Configuration

Pair the model's `@D1Schema(vectors: [D1VectorField("embedding", dimensions: 32, binding: "VECTORS")])` with a JSON `ModelVectorValue? embedding` field. In `katana.yaml`, set `cloudflare.d1.vectorize.dev.VECTORS: <dev-index-name>` and use a different index name for prod. Dimensions range from 32 to 1536. Fields sharing a binding must have identical dimensions and metrics.

`katana apply --flavor dev` creates or reuses the index, validates dimensions and the distance metric, and registers environment-specific Vectorize bindings, a per-minute cron trigger, and `D1VectorSchedule`. The Wrangler token requires Vectorize Edit permissions for the target account. On failure, resources such as D1 may already have been created; inspect the resource inventory before resuming. Dependencies are not added automatically.

Migrations create `_masamune_vector_state`, `_masamune_vector_jobs`, a due index, and INSERT/UPDATE/DELETE triggers for the target columns. Internal schemas are also checked before and after application. Run rebuild through the administrative API for existing rows. Ordinary migrations reject vector definition removal or changes to dimensions, metrics, or bindings. Switching to another index requires a separate migration procedure. Apply changes in database → Worker order, and use a Worker version that preserves existing vectors when saving without a vector.
