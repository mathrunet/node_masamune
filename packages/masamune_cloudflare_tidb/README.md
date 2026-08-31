<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"s><br/>
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

Just load the package in index.ts and pass the predefined data to the methods to implement the server side.

Also, [masamune_functions_cloudflare](https://pub.dev/packages/masamune_functions_cloudflare) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_tidb
```

# Implementation

Pass the return value of the `deploy` function to `export default`. It is defined by passing various Workers to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_tidb";

// Define [m.Functions.xxxx] for the functions to be added to Workers.
//
// Workersに追加する機能を[m.Functions.xxxx]を定義してください。
export default m.deploy(
    [
        m.Functions.tidb(),
    ],
);
```

## Configuration

This package uses TiDB Data Service over HTTPS with Digest authentication.
Every CRUD request explicitly selects its database with the
`database/<database>/<table>/<document_id>` path. A generated runtime manifest
maps the Masamune CRUD contract to Data Service endpoints.

CRUD requests may pass `prefix` to select a prefixed physical database while
rules continue to evaluate the logical database path. For example,
`database/app_db/users?prefix=dev___` connects to `dev_app_db.users`. Prefixes
are normalized to exactly one trailing underscore. Missing, empty, and
underscore-only values keep the unprefixed database.

All reads and writes go through the Workers CRUD endpoint. Flutter clients
never receive Data Service credentials.

### Server scoped rules

The CRUD endpoint is called directly from clients, so rules are evaluated as a
client request. `"server"` access rules, and rules that set `"server": true`,
are always denied unless the request proves that it comes from a trusted
backend. To allow a backend to be evaluated as a server request, configure a
shared secret and send it in a header.

```bash
wrangler secret put TIDB_SERVER_ACCESS_TOKEN
```

```typescript
m.Functions.tidb({
  // Optional. Defaults to `x-masamune-server-token`.
  serverAccessHeader: "x-masamune-server-token",
});
```

```text
x-masamune-server-token: <TIDB_SERVER_ACCESS_TOKEN>
```

Never ship this token to clients. Without `TIDB_SERVER_ACCESS_TOKEN` (or
`serverAccessToken`), every request stays a client request. Note that a rule
such as `{"type": "path", "param": "uid", "server": true}` denies owner access
from clients as well. Remove `"server": true` from such rules when the owner
must be able to read or write from the app.

```typescript
import manifest from "./tidb_data_service_manifest.json";

m.Functions.tidb({
  dataServiceManifest: manifest as m.TidbDataServiceManifest,
  maxScanRows: 1000,
});
```

Data Service bindings:

- `TIDB_DATA_SERVICE_APP_ID`
- `TIDB_DATA_SERVICE_REGION`
- `TIDB_DATA_SERVICE_PUBLIC_KEY`
- `TIDB_DATA_SERVICE_PRIVATE_KEY`
- `TIDB_DATA_SERVICE_MAX_SCAN_ROWS`

Supported equality/range/`whereIn` conditions are mapped to generated endpoint
parameters. Other filters and ordering are evaluated in Workers after a
bounded scan. A scan larger than `maxScanRows` fails instead of silently
returning incomplete data.

## Katana CLI

Annotate flat Masamune models with `@tidbDataService`, run
`katana code generate`, and configure the generated official CaC directory:

```dart
@TidbDataService(prefixes: ["dev"])
@CollectionModelPath("database/app_db/users")
abstract class UserModel {}
```

This generates both `app_db.users` and `dev_app_db.users` endpoints. The
adapter prefix must have a corresponding generated manifest entry; Data
Service never falls back to the unprefixed database.

```yaml
cloudflare:
  tidb:
    enable: true
    project_id: "123"
    cluster_id: "456"
```

Organization API credentials belong in `katana_secrets.yaml` under
`cloudflare.tidb.management_api.public_key/private_key`. The first
`katana apply` validates a supported active Starter AWS cluster, applies the
additive schema, upserts endpoints, deploys them, stores generated state in
`cloudflare/tidb.yaml`, and prepares Workers. The managed state file is added
to `cloudflare/.gitignore` because it contains the generated Data API private
key. The first apply intentionally leaves MySQL public access enabled. Run
`katana cloudflare deploy`, then run `katana apply` again. The second run
smoke-tests Data Service and disables the TiDB public endpoint. API failures
preserve the public endpoint and print the GitHub CaC fallback path.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
