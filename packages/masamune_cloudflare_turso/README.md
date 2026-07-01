<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"s><br/>
  </a>
  <h1 align="center">Turso for Cloudflare Workers</h1>
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

Also, [katana_functions_firebase](https://pub.dev/packages/katana_functions_firebase/score) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_turso
```

# Implementation

Pass the return value of the `deploy` function to `export default`. It is defined by passing various Workers to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_turso";
import rulesJson from "../rules.json";

export default m.deploy(
  [
    m.Functions.turso({
      organizationName: "xxxx",
      groupName: "xxxx",
      autoCreateDatabase: true,
      autoCreateTable: true,
      autoMigrateAddColumns: true,
    }),
    m.Functions.tursoToken({
      organizationName: "xxxx",
      groupName: "xxxx",
    }),
  ],
  {
    rules: rulesJson,
  },
);
```

Cloudflare bindings are also supported and take precedence over options:

- `TURSO_PLATFORM_API_TOKEN`
- `TURSO_ORGANIZATION_NAME`
- `TURSO_GROUP_NAME`

For production, store the Platform API token as a secret:

```bash
wrangler secret put TURSO_PLATFORM_API_TOKEN
```

# Endpoints

The package exposes Turso through a single provider path.

| Method   | Path           | Description                       |
| -------- | -------------- | --------------------------------- |
| `GET`    | `/turso/database/{database}/{table}` | Read rows or count rows. |
| `GET`    | `/turso/database/{database}/{table}/{indexKey}` | Read a row. |
| `POST`   | `/turso/database/{database}/{table}` | Create a row. |
| `POST`   | `/turso/database/{database}/{table}/{indexKey}` | Create a row with an explicit ID. |
| `PUT`    | `/turso/database/{database}/{table}` | Update rows. |
| `PUT`    | `/turso/database/{database}/{table}/{indexKey}` | Update a row. |
| `DELETE` | `/turso/database/{database}/{table}` | Delete rows. |
| `DELETE` | `/turso/database/{database}/{table}/{indexKey}` | Delete a row. |
| `POST`   | `/turso/token/database/{database}` | Issue a database-scoped short-lived token. |

`GET` uses the path for `database`, `table`, and optional `indexKey`.

```text
/turso/database/main/users/user_1
```

Collection queries can pass `where`, `orderBy`, and `limit`.

```text
/turso/database/main/users?where=[{"type":"equalTo","key":"name","value":"Alice"}]&orderBy=[{"key":"created_at","descending":true}]&limit=20
```

Supported `where` types are `equalTo`, `notEqualTo`, `lessThan`,
`lessThanOrEqualTo`, `greaterThan`, `greaterThanOrEqualTo`, `whereIn`,
`whereNotIn`, `isNull`, `isNotNull`, and `like`.

`POST` / `PUT` / `DELETE` use the same path format and JSON bodies for
`value` or query filters.

```json
{
  "value": {
    "name": "Alice"
  }
}
```

The previous query/body style is still accepted for compatibility:

```text
/turso?database=main&table=users&indexKey=user_1
```

# Database and schema management

The worker can create Turso databases and tables automatically.

```typescript
m.Functions.turso({
  organizationName: TURSO_ORGANIZATION_NAME,
  groupName: TURSO_GROUP_NAME,
  platformApiToken: TURSO_PLATFORM_API_TOKEN,
  autoCreateDatabase: true,
  autoCreateTable: true,
  autoMigrateAddColumns: true,
});
```

`groupName` must point to an existing Turso group. The region/location is set
when the group is created, not when each database is created.

```bash
turso group create my-group --location aws-ap-northeast-1
```

`groupName` can also be omitted when the runtime environment provides
`TURSO_GROUP_NAME`, such as through a local `.env` file or Cloudflare Worker
environment variables. When neither `groupName` nor `TURSO_GROUP_NAME` is
configured, database access that needs automatic database creation returns an
error.

Automatic migration is intentionally limited to additive field changes.

- New fields in `value` are added with `ALTER TABLE ADD COLUMN`.
- Existing fields are not migrated when their inferred type changes.
- Field rename, field deletion, primary key changes, unique constraints, and foreign keys are not automatically migrated.
- `PUT` and `DELETE` require `indexKey` or `where` to avoid accidental full-table changes.

The default table shape is:

```sql
CREATE TABLE IF NOT EXISTS table_name (
  id TEXT PRIMARY KEY,
  created_at INTEGER,
  updated_at INTEGER,
  ...
)
```

Objects and arrays are stored as JSON strings.

# Rules

Rules are provided by `@mathrunet/masamune_cloudflare` and are shared with
other Cloudflare database packages. Pass an imported `rules.json` to
`WorkersOptions.rules` on `deploy`, or pass the same config to each function
option.

```json
{
  "version": "1",
  "rules": {
    "database/main": {
      "read": "allow",
      "write": "server"
    },
    "database/main/table/users/*": {
      "read": "authenticated",
      "write": { "type": "field", "field": "ownerId", "server": true }
    }
  }
}
```

# Database-scoped short-lived token

Use `/turso/token/database/{database}` to issue a Turso database token after
resolving `read-only` or `full-access` authorization through `rules`.

Token authorization is evaluated against the database path:

```json
{
  "version": "1",
  "rules": {
    "database/main": {
      "read": "authenticated",
      "write": "deny"
    }
  }
}
```

If `read` is allowed and `write` is denied, the worker issues a `read-only`
token. If both `read` and all write operations are allowed, the worker issues a
`full-access` token. If `read` is denied, the token request returns `403`.

Named path parameters can be compared with the authenticated user ID:

```json
{
  "version": "1",
  "rules": {
    "database/{uid}": {
      "read": { "type": "path", "param": "uid" },
      "write": { "type": "path", "param": "uid" }
    }
  }
}
```

With this rule, only the authenticated user whose `uid` is equal to the
database name can access that database.

Read and write operations can be restricted to the Workers endpoint while
issuing only the direct Turso token that is safe for the requested scope:

```json
{
  "version": "1",
  "rules": {
    "database/{uid}": {
      "read": { "type": "path", "param": "uid" },
      "write": {
        "type": "path",
        "param": "uid",
        "server": true
      }
    }
  }
}
```

`server` can also be used with `read` and `field` rules. A server-side rule
does not grant direct token access for that operation.

Table/document rules below the database path are also treated as server-side
rules for token issuance when they restrict `read` or `write`. This is
intentional because Turso Platform tokens are database-scoped and cannot enforce
document-level `field` or `path` checks on the client.

For a database-level Turso token, send `operations` without a table:

```json
{
  "ttlSeconds": 600,
  "operations": ["read"]
}
```

When the client also needs the Workers backend to decide whether a specific
table must use Functions fallback, send `targets`. `targets` are used only for
Masamune rules resolution; they are not passed to Turso as token scopes.

```json
{
  "ttlSeconds": 600,
  "targets": [
    {
      "table": "users",
      "operations": ["read", "write"]
    }
  ]
}
```

The response is:

```json
{
  "token": "<jwt>",
  "expiresAt": 1760000000,
  "url": "libsql://your-db.turso.io",
  "readMode": "direct",
  "writeMode": "functions",
  "targets": [
    {
      "table": "users",
      "operations": ["read", "write"],
      "readMode": "direct",
      "writeMode": "functions"
    }
  ]
}
```

If both read and write are functions-only, `/turso/token/database/{database}`
does not return `token`, `expiresAt`, or `url`; it returns only the resolved
modes and targets:

```json
{
  "readMode": "functions",
  "writeMode": "functions",
  "targets": [
    {
      "table": "users",
      "operations": ["read", "write"],
      "readMode": "functions",
      "writeMode": "functions"
    }
  ]
}
```

The previous `scope` request field and `scopes` response field are still
accepted/returned for compatibility, but new clients should use `operations`
and `targets`.

`url` is resolved by the Workers backend. This lets clients use direct libSQL
access for dynamically created databases without building the Turso hostname on
the client.

`ttlSeconds` defaults to 600 seconds and is capped by `maxTtlSeconds` (default: 3600 seconds).

Tokens are generated with the Turso Platform API:

```text
POST /v1/organizations/{organizationSlug}/databases/{databaseName}/auth/tokens
```

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
