<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Durable Objects for Cloudflare Workers</h1>
</p>

<p align="center">
  <a href="https://github.com/mathrunet">
    <img src="https://img.shields.io/static/v1?label=GitHub&message=Follow&logo=GitHub&color=333333&link=https://github.com/mathrunet" alt="Follow on GitHub" />
  </a>
  <a href="https://x.com/mathru">
    <img src="https://img.shields.io/static/v1?label=@mathru&message=Follow&logo=X&color=0F1419&link=https://x.com/mathru" alt="Follow on X" />
  </a>
  <a href="https://www.youtube.com/c/mathrunetchannel">
    <img src="https://img.shields.io/static/v1?label=YouTube&message=Follow&logo=YouTube&color=FF0000&link=https://www.youtube.com/c/mathrunetchannel" alt="Follow on YouTube" />
  </a>
  <a href="https://github.com/invertase/melos">
    <img src="https://img.shields.io/static/v1?label=maintained%20with&message=melos&color=FF1493&link=https://github.com/invertase/melos" alt="Maintained with Melos" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/mathrunet"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4&link=https://github.com/sponsors/mathrunet" alt="GitHub Sponsor" /></a>
</p>

---

[[GitHub]](https://github.com/mathrunet) | [[YouTube]](https://www.youtube.com/c/mathrunetchannel) | [[Packages]](https://pub.dev/publishers/mathru.net/packages) | [[X]](https://x.com/mathru) | [[LinkedIn]](https://www.linkedin.com/in/mathrunet/) | [[mathru.net]](https://mathru.net)

---

Provides SQLite storage per authenticated user, schema management, Turso migration, and queue leases. On Flutter, use the `masamune_model_do` adapters with `DurableObjectSchema` and its builder. See [MIGRATION.md](MIGRATION.md) for setup examples and migration requirements.

# Installation

Install the following package:

```bash
npm install @mathrunet/masamune_cloudflare_do
```

# Implementation

## Runtime behavior

- Register `Functions.durableObject({binding, databases})` with the existing `deploy`, authentication adapter, and explicit allow rules. The UID comes from the context verified by the authentication adapter.
- Durable Object names are JSON arrays of `[FLAVOR, physicalDatabaseName, UID]`. Development databases use the `dev_` prefix, and allowed databases are checked. Client-supplied user IDs or prefixes cannot select another object.
- Export a class extending `DurableObjectDatabase` and pass it the generated manifest and approved revisions. Katana CLI generates the class and binding.
- Reads support documents, collections, `where`, `orderBy`, `limit`, `count`, and Vectorize nearest-neighbor queries. Ordinary comparisons, IN, substring, and JSON array conditions are supported. The default scan limit is 1000 rows, configurable up to 1999. Offset is not supported.
- POST saves a complete document (upsert); PUT applies a partial update; DELETE requires a document ID. Write batches support up to 100 operations in one Durable Object. SQL changes and migration change records commit in the same transaction. Cross-object batches and callback-based transactions are not supported.
- INTEGER values must be within the safe integer range. Use TEXT for larger integers and exact decimal values. JSON and BOOLEAN values are restored according to the manifest.
- Empty or unmatched rules deny access. POST requires both create and update permission. Field and fieldMatch authorization are unsupported and rejected.
- Requests are rejected if the Dart session's declared UID or environment differs from the authenticated UID or environment. Discard the session and create a new one when authentication changes.

## Administration

`POST /do/admin/<database>/<userId>/status` returns the target object's applied revision history and migration progress. `migrate` copies up to 100 rows from Turso and updates the cursor. Store `DO_SERVER_ACCESS_TOKEN` as a Worker secret and authenticate with `x-masamune-server-token`. Even a status request for a user without an existing object starts the object and applies approved schemas.

Call `QueueCoordinator` through a Worker binding. If exposed externally, the calling Worker must enforce administrative authentication. Requests use `{action,key,owner,ttlMs,generation}` and support acquire, renew, release, and complete. TTL ranges from 100 to 300000 ms. Generation numbers persist after release, and completed keys cannot be acquired again. Leases do not make external-store side effects atomic; callers must also check the generation.

## Verification

Run `npm run build` and `npm test -- --runInBand` on Node 22. Unit tests use Node SQLite. Dedicated fixtures use Wrangler Durable Objects, the package's Flutter adapter, and dedicated cloud Durable Objects and Turso databases to verify user isolation, batch rollback, competing leases, updates/deletes/recreation during migration, and recovery after failure. These checks do not guarantee high-load performance or cover every authentication provider combination.

## Per-user subscriptions

Also register `Functions.durableObjectSockets({binding,databases})` with the same `deploy`. Katana CLI generates the regular API and a ticket-only connection entry point. Keep authentication enabled on the regular API. Apps making cross-origin HTTP requests must configure allowed origins and headers on the host.

- Send `{table,indexKey?,where?,orderBy?,limit?,ticket?}` to the authorized `POST /do/sync/<database>` endpoint. It returns the current full snapshot and persistent `sequence` from the same SQL transaction.
- With `ticket:true`, the response also includes a single-use ticket bound to the verified UID, environment, database, and table. Its expiry is the earlier of the authentication token's `exp` and 30 seconds. Custom providers without `exp` still require reauthentication after 30 seconds.
- Upgrade `GET /do-connect/<database>/<userId>?ticket=...` to WebSocket. Only this entry point uses ticket authentication and bypasses regular authentication middleware. Do not put long-lived tokens in URLs. Redact short-lived tickets from access logs as well.
- Notifications contain only `{type:"invalidate",sequence,bootId}`, never documents or query results. Every subsequent snapshot fetch is reauthorized by the existing authentication and rules. This prevents delivery after authorization changes; Flutter invalidates the affected subscription cache and displayed data on 401/403. Idle subscriptions recheck every 15 seconds, and sockets reauthenticate at least every 30 seconds. Erasure of fully offline device data or revocations not detected by the provider cannot be guaranteed.
- A sequence number immediately after connection detects changes between the initial snapshot and connection. Disconnects, redeployments, and sequence rollback trigger full-snapshot resynchronization. No delta history is retained, so history truncation cannot lose deletions, but refetching incurs network and SQL costs.
- `acceptWebSocket`, connection attachments, persistent sequence numbers, and alarms restore state after hibernation. `bootId` is a diagnostic value that changes on each construction, not a schema version or data epoch.
- Each object allows 64 unused tickets and 32 connections. Snapshots are limited to 1 MiB and the existing row limit. Changes to the same table trigger notifications. Subscriptions return 503 while migration is incomplete. Field authorization, subscriptions across personal objects, and offline write queues are unsupported. Use the shared topics below for explicit sharing.

To verify actual hibernation, keep the same connection, send `resync`, and confirm that `bootId` changes. Waiting or reconnecting alone does not demonstrate hibernation.

## Vectorize nearest-neighbor search

Set `vectors: [{field,binding,dimensions,metric}]` on a table in the schema manifest. Also include each field in `vectorFields` and store it as a JSON column. Katana CLI generates and validates the Vectorize index, Worker binding, and manifest from the same configuration.

Document data, the current generation, and delivery jobs commit in one Durable Object SQLite transaction. Alarms retry external Vectorize synchronization with exponential backoff. Administrative `vector-status`, `vector-drain`, and `vector-rebuild` operations are available. Queries recheck current generations and SQLite where conditions, and the Worker reevaluates rules for each candidate. Stale generations are excluded immediately after an update, so results may be incomplete until Vectorize catches up.

`nearest` supports one field, and `limit` ranges from 1 to 100. Vectorize namespaces derive from the environment, physical database, authenticated UID, table, and field. Vectorize does not participate in Durable Object transactions, so a successful write response does not mean that the external index is up to date.


## Shared topics and hubs

Use `DurableObjectModelSession(sharedTopic: "room-id", ...)` to read, write, and subscribe to shared data. Personal object keys remain unchanged. Shared data objects use `["shared", environment, physicalDatabase, topic]`; delivery hubs use `["hub", environment, physicalDatabase, topic, generation, shard]`. Topics contain 1–128 alphanumeric characters, underscores, or hyphens. **Existing personal data is not automatically migrated to shared storage.**

Configure the same `shared: {binding, shards, generation, authorize}` on the Worker's regular API and socket entry point, and the same binding, shard count, and generation in the data object's `DoConfig.shared`. Provide an exported class extending `SharedHub` and a dedicated Durable Object binding. See [MIGRATION.md](MIGRATION.md) for Katana CLI configuration.

`authorize(context, {topic, database, table, method})` checks verified authentication information and server-side membership permissions. Both this check and existing rules must pass for every CRUD request, batch operation, and snapshot or ticket request. A client topic header does not grant access. Generated configuration denies access when the callback is missing. Membership is checked on every fetch; Flutter removes the subscription cache on 401/403. Tickets are bound to participant UID, topic, table, environment, and database and cannot be reused with another hub.

Shared snapshot responses with `ticket:true` also include `hub: {generation, shard}`. The connection endpoint is `/do-connect/shared/<database>/<topic>/<userId>/<generation>/<shard>?ticket=...`. Notification sequences are hub-local diagnostics; comparing them to data-object sequences cannot establish that nothing changed. Every notification, including those immediately after connection, triggers an authorized full-snapshot refetch. Flutter renews connections approximately two seconds before the returned expiry rather than waiting for a delayed close handshake. Authorization rechecks still run every 15 seconds.

Notification delivery follows these rules:

- Data changes, persistent sequence numbers, and the hub notification outbox are saved in the same SQLite transaction, preserving CRUD and batch atomicity within the data object.
- Pending notifications are coalesced to the latest sequence per table and hub and sent to all shards. Notification failures do not undo commits; persistent alarms retry them. An alarm is scheduled before the write so recovery also covers termination immediately after commit.
- Each delivery pass sends at most 32 notifications. Success deletes only outbox entries whose sequence still matches, preserving newer concurrent updates. Failures retry starting after one second. Hubs suppress duplicate and out-of-order notifications per table. The protocol converges to the latest snapshot; it does not guarantee delivery of a complete change history.
- Shards are configured as a fixed count from 1 to 32 and assigned per connection. If a shard's tickets are full, another shard is tried. Each hub allows 2,048 connections and 4,096 unused tickets. These are implementation limits, not performance guarantees at that scale. Full capacity returns 429. Existing personal-object limits remain unchanged.
- When changing the shard count, also change the generation and deploy them together. Data-object keys remain unchanged. New tickets connect to the new generation; old connections reauthenticate before expiry. Periodic full snapshots cover the transition. Remaining old-generation outbox entries are still delivered, so drain the queue and confirm that old connections have closed before removing a binding.

**Only notification delivery and connections are distributed; each topic's SQLite data and snapshot reads remain in one Durable Object.** Full-snapshot reads, short-lived ticket issuance, authorization costs, and data-object throughput limit capacity. Shared Turso migration source configuration, shared administration APIs, shared nearest-neighbor search, queries across personal objects, automatic data partitioning, and automatic scaling are unsupported. Vector columns in shared tables use topic-isolated namespaces, but shared nearest-neighbor queries are rejected.

Cloudflare connection limits do not establish practical capacity. Measure with the app's data volume, update rate, and authentication provider, taking the [Hibernation API](https://developers.cloudflare.com/durable-objects/api/state/) and [alarm retry behavior](https://developers.cloudflare.com/durable-objects/api/alarms/) into account.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
