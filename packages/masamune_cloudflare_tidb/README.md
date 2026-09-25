<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">TiDB for Cloudflare Workers</h1>
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

A Worker adapter that connects to TiDB over HTTPS using `@tidbcloud/serverless` 0.3.0.

# Installation

Install the following package:

```bash
npm install @mathrunet/masamune_cloudflare_tidb
```

# Implementation

Register TiDB in the region Worker entry (`src/region.ts`) and place that Worker near the TiDB cluster. See "Edge and Region Workers" in the `@mathrunet/masamune_cloudflare` README.

```typescript
// src/region.ts
import * as m from "@mathrunet/masamune_cloudflare_tidb";
import schema from "./tidb_schema.json";
import rules from "./rules.json";

export default m.deploy([
  m.Functions.tidb({schemaManifest: schema as m.SchemaManifest}),
], { type: "region", rules: rules as m.RulesConfig });
```

```jsonc
// wrangler.region.jsonc
{
  "name": "my-app-region",
  "main": "src/region.ts",
  // Use the region of the TiDB cluster.
  "placement": { "region": "aws:us-east-1" }
}
```

Each SQL statement is one HTTPS round trip from the Worker to TiDB. Without placement, the Worker runs near the client and every statement crosses the distance to the cluster. Flutter should use a `CloudflareFunctionsAdapter` for the region Worker endpoint in `TidbModelAdapter`.

Set `TIDB_HOST`, `TIDB_USERNAME`, and `TIDB_PASSWORD` as Worker secrets. Do not distribute SQL credentials to Flutter apps. The Worker conditional exports are selected through `workerd`/`browser` and do not load Node-only Express dependencies.

The CRUD URL is `/tidb/database/<database>/<table>[/<id>]`, and responses use `{data: ...}`. Only databases, tables, and columns listed in the manifest are used, and values are passed as driver parameters. Filtering, sorting, limits, and counts run in the database. Exceeding the `maxScanRows` retrieval cap (default 1000) produces an error.

`FLAVOR=dev` adds a `dev_` boundary to the physical database name, with the request's `prefix` appended after it. Rules are evaluated against the logical database name. Server rules require `TIDB_SERVER_ACCESS_TOKEN` and the `x-masamune-server-token` header. Missing or mismatched tokens are rejected. Do not distribute this token to Flutter apps either.

BIGINT values are converted to Number only within the safe integer range; larger values and DECIMAL values remain strings. JSON, boolean, and vector values are restored according to the manifest. Dart models should also receive precision-sensitive values as String. Timeouts abort fetch and response body reads; mutations with unknown outcomes are not retried automatically.

Use `TidbDirectClient.transaction(database, callback)` for atomic server-side operations. SQL inside the callback is sent serially within the same transaction and rolled back on failure. A lost commit response produces an error with an unknown outcome. Flutter `runTransaction` and batch operations continue to execute operations sequentially and do not guarantee database atomicity.

Generate schemas using `@TidbSchema` → `katana code generate` and apply DDL with `katana migrate`. `katana apply` only applies connection settings. See the [migration guide](MIGRATION.md) for details.

The Data Service client, Digest authentication, CaC/endpoint generation, and compatibility with legacy settings are not provided. When upgrading a published app, update the annotation, builder, CLI, and Node package together.

## Native Vectors

Save, update, delete, and run `nearest` on fixed-dimension vectors in the declared schema. Supported distance metrics are `cosine` (default) and `euclidean`; dimensions range from 1 to 16383, and search limits range from 1 to 100 (default 10). Finite float32 values, dimensions, and metric consistency are validated; zero vectors are rejected for cosine distance.

For GET requests, `nearest` is the JSON string `{"key":"embedding","value":[1,0,0]}`. Ordinary `where` conditions are applied in the database, results are ordered by distance with ID as a tie-breaker, and candidates' document rules are reevaluated. Authorization filtering may return fewer results than the limit. Combining nearest with `count`, `orderBy`, or a document ID, or including it in a mutation request, is rejected.

Stored values accept arrays or `ModelVectorValue` JSON; reads return `@type`, `@source`, `@vector`, and `@measure`. An unfetched value represented by `@vector: []`, or an omitted vector column, preserves the existing value; explicit `null` clears it. Existing TEXT columns are not implicitly converted to native vectors. Plan a separate column migration and data conversion first.

The TiDB manifest specifies `sqlType: "VECTOR(3)"` and optionally `vectorMetric: "euclidean"`. It uses `VEC_FROM_TEXT` and `VEC_COSINE_DISTANCE`/`VEC_L2_DISTANCE`. ANN indexes are not generated automatically; search is exact using SQL distance calculations. Migration application and reapplication, CRUD, authorization, preservation of unfetched values, NULL, Euclidean distance, rollback, and round trips using the official Flutter Adapter and generated models have been verified on a dedicated TiDB database.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
