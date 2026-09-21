# DO Schemas and Turso Migration

## Initial Setup

1. Annotate models with `@DurableObjectSchema()` and generate `do/schema/schema.json` using `katana code generate`. Define multiple databases using each annotation's database and development environments using prefixes.
2. Configure `cloudflare.durable_object.enable`, binding, database, schema, and migrations, then run `katana apply --flavor dev`. The `approved` file is stored at `cloudflare/src/do_revisions.json`.
3. Run `katana migrate generate --backend do --flavor dev --version 20260920_initial` to generate the diff and history with SHA-256 hashes.
4. Dry-run with `katana migrate apply --backend do --flavor dev --version 20260920_initial`, then add `--apply` to approve revisions for deployment. This does not execute SQL on all DOs at this stage.
5. Deploy the Worker. On first access, each DO checks its ledger against the actual schema and executes pending SQL in a transaction. New and hibernating DOs apply the same history in order.
6. `katana migrate status --backend do --flavor dev` displays locally approved history and unapproved diffs. Specify `--endpoint <Worker URL> --user-id <UID>` and the `DO_SERVER_ACCESS_TOKEN` environment variable to also retrieve the target DO's actual state.

`katana apply` handles DO class deployment configuration; `katana migrate` handles approval of SQL inside DOs. Prepare the class and administrative routes first for initial setup. Bundle the schema and revisions in the same Worker version. History older than the deployed version, hash mismatches, unmanaged tables, or column changes stop ordinary access. On failure, restore the correct history and redeploy. Do not swallow errors and open the database as if it were new.

Ordinary migrations only add tables, nullable columns, and non-unique indexes. Deletions, type changes, and NOT NULL/UNIQUE additions are rejected. Store schema history in per-database directories; the approval file combines histories for multiple databases. Approve all affected histories before deploying a multi-database update.

## Migrating from Turso

Return the migration source for each user/environment/database from server configuration through `DoConfig.source(identity)`. For Katana-generated classes, configure `setDoSource(env => identity => ...)` from index.ts. Do not accept URLs or tokens from requests. Missing configuration for a user must throw an exception rather than allowing access to an empty DO.

The standard implementation is `new TursoMigrationSource({url, token, manifest, database, writersRevoked:true})`. `writersRevoked` indicates operational confirmation. Enable it only after stopping the app's legacy write path and token reissuance, revoking existing direct-write credentials, and issuing migration-only credentials. Separately block legacy paths with group tokens or Platform API permissions. The library alone cannot guarantee revocation of existing credentials.

On first access, INSERT/UPDATE/DELETE rejection triggers and an epoch are recorded for the source tables in the same transaction. Every copy request checks that writes remain blocked. Old credentials with DDL permissions could remove the triggers, so credential revocation is mandatory. The source becomes read-only from that point, and the DO becomes the new write destination.

- Lazy migration: prepare on the first request. Document GET/PUT requests import required source rows. Collection/count requests copy one page at a time and return 503 to request a retry until complete. A partial subset is never returned as a complete query result.
- Batch migration: call the administrative migrate operation until complete. Store the table position and primary-key cursor in the DO, and import each page and update its cursor in the same transaction.
- DO writes during migration maintain a change record keyed by table and ID. Late copies do not overwrite changed IDs, and deletion records prevent fallback reads from resurrecting deleted data.
- On failure, rerun with the same source and epoch. Redeployments resume from the cursor. Do not remove the source or replace it with another database.
- After completion, read only from the DO. The source is not deleted automatically, and there is no automatic fallback to the old path. Returning to Turso after DO updates requires a separate reverse migration and reconciliation of every DO change and deletion.

Unknown source columns, non-string IDs, unsafe integers, malformed JSON, and similar values are rejected. BLOBs, custom triggers, and nonstandard schemas are not migrated transparently. Change records, leases, and migration ledgers have no automatic garbage collection; manage capacity according to operational volume.


## Adding Subscriptions to Existing DOs

Step 6 adds internal sequence and single-use ticket tables on access. Business manifests, approved SQL history, and Wrangler class names remain unchanged, so existing DOs are not deleted or recreated. Update generated classes and `Functions.durableObjectSockets` registration with commands such as `katana apply --flavor dev`, deploy the Worker first, then enable the Listenable Adapter. Snapshot subscriptions return 503 until Turso migration completes.

The generated DO base class uses `webSocketMessage`, `webSocketClose`, `webSocketError`, and `alarm` for synchronization. If overriding them in a custom class, retain delegation to the base handlers. Do not introduce this into custom DOs with existing alarm uses without reviewing the integration.


## Introducing Shared Hubs and Changing Shards

Set the following under `cloudflare.durable_object.shared_hub` and apply the DO action. Keep the existing data DO migration tag unchanged.

```yaml
shared_hub:
  enable: true
  binding: MASAMUNE_SHARED_HUB
  shards: 4
  generation: v1
  class_migration_tag: masamune-shared-hub-v1
```

The generated class is `MasamuneSharedHub`. It is added through a separate class migration from existing DOs; shared business data uses the existing approved manifest/revisions. From `index.ts`, call the generated module's `setSharedHubAuthorize` to register a function checking the authenticated UID's topic membership. Without registration, all access is denied. Do not use arbitrary-UID header authentication from tests in production.

To change shards, update `shards` and `generation`, regenerate, and deploy. Keep `class_migration_tag` unchanged, and do not move or initialize shared data. Existing connections move to the new generation through reauthentication before expiry, full snapshots on disconnection, and polling every 15 seconds. Confirm completion by verifying new-generation connections and matching snapshots. Older generations use the same hub class/binding, so do not delete the class during the change.

Do not disable sharing merely by toggling enable. Confirm that usage has stopped, the outbox is drained, and old connections have closed; then explicitly manage the Wrangler class lifecycle separately. Deleting the class deletes delivery DOs for every topic, so do not use it for ordinary shard count changes.
