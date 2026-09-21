<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">D1 for Cloudflare Workers</h1>
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

A ModelAdapter server using D1 bindings and the Sessions API. The initial release is 3.1.0.

# Installation

Install the following package:

```bash
npm install @mathrunet/masamune_cloudflare_d1
```

# Implementation

```ts
import * as m from "@mathrunet/masamune_cloudflare";
import * as d1 from "@mathrunet/masamune_cloudflare_d1";
import schemaManifest from "./d1.schema.json";

export default m.deploy([
  d1.Functions.d1({ schemaManifest, bindings: { main: "MASAMUNE_D1", dev_main: "MASAMUNE_D1" } }),
], { rules: { version: "1", rules: { database: { "**": { read: "server", write: "server" } } } } });
```

Validate and type the imported JSON manifest as `SchemaManifest` in TypeScript. Register bindings in the Wrangler configuration for each environment and set `FLAVOR=dev` for the development Worker. For server authentication, register `D1_SERVER_ACCESS_TOKEN` as a Worker secret and send it only from trusted servers. Do not embed the server token in Flutter apps; normally, configure an authentication adapter and the corresponding rules. Empty or unmatched rules deny access.

Supports CRUD, comparisons, NULL, in, string containment, JSON array containment, orderBy, limit, and count. Conditions on the same column are combined with AND. The row retrieval cap defaults to 1000 and can be configured from 1 to 1999; exceeding it returns 413. Each statement supports up to 100 bound values.

POST performs an upsert with an ID and requires both create and update permissions. PUT and DELETE require a document ID. A batch executes 1–100 changes on the same binding using an atomic D1 batch. Error responses do not expose SQL, values, or driver exceptions. Mutations are not retried automatically; read the current state when the outcome is unknown.

JSON and BOOLEAN values are restored according to the manifest. INTEGER values must be within the JavaScript safe integer range; use TEXT for larger integers and precise decimals. field/fieldMatch authorization, callback-based transactions, and Listenable are unsupported and explicitly rejected.

See [Migration](MIGRATION.md) for DDL and migration history.

## D1 and Vectorize

Register a JSON column in `D1Schema.vectors` to update generations and the outbox through triggers in the same D1 transaction as saves, updates, deletions, and batches. Accepts ModelVectorValue or numeric arrays and validates dimensions (32–1536), finite values, and the distance metric. An upsert without a vector preserves the existing value; null removes it, and an empty array is an input error.

Register `new d1.D1VectorSchedule(options)` and a cron trigger with the Worker. `katana apply` adds both when Vectorize is configured. Each cron run processes 10 jobs per database. Retry intervals range from 1 second to 1 hour, with reconciliation continuing hourly after acceptance. Generation-specific IDs allow searches to check the current generation and authorization and exclude delayed upserts from older generations. Deletion of older generations is also retried. Jobs and state are not automatically deleted, so D1 capacity and reconciliation costs depend on update volume. Acceptance by Vectorize does not mean the update is searchable.

For GET requests, `nearest` is JSON: `{ "key": "embedding", "value": [1,0,0] }`. Results are selected from the top 100 Vectorize candidates after checking D1's current generation, document content, ordinary where conditions, and per-document rules. The limit is 1–100, defaulting to 10; filtering can return fewer results. Exact top-K results and a total count are not guaranteed, and nearest cannot be combined with count/orderBy. Namespaces isolate physical databases, tables, and fields. Document content and authorization information are not copied into Vectorize metadata.

Administrative POST requests to `/d1/vector/<logicalDatabase>/<drain|rebuild|status>` require server authentication using `D1_SERVER_ACCESS_TOKEN`. Use `{}` as the body; drain accepts `limit` (1–100), and rebuild accepts `table`, `cursor` (empty initially), and `limit`. Continue with the cursor returned by rebuild until done, then run drain. Triggers also capture concurrent inserts before the cursor. Status returns pending/failed/accepted counts and the next retry time; accepted does not mean search visibility has been confirmed. These endpoints are intended only for SDK consumers' servers and operators.

On 2026-09-20, dedicated D1/Vectorize resources and a Worker were used to verify the official Flutter Adapter, updates and deletions, authorization, rebuild cursor resumption with concurrent changes, and persistent retries after binding failures. Search visibility took approximately 17–27 seconds in this small-scale test; this is not a guaranteed latency bound. Quota exhaustion, high load, and all combinations of real-user authentication providers remain unverified.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
