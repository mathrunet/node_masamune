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

export default m.deploy(
    [
        m.Functions.turso({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
            rules: {
                version: "1",
                rules: {
                    "database/*/table/*/*": {
                        read: "deny",
                        write: "deny",
                    },
                    "database/main/table/users/*": {
                        read: "authenticated",
                        write: "authenticated",
                    },
                },
            },
        }),
        m.Functions.tursoToken({
            url: TURSO_DATABASE_URL,
            authToken: TURSO_AUTH_TOKEN,
            rules: {
                version: "1",
                rules: {
                    "database/main/table/users/*": {
                        read: "authenticated",
                    },
                },
            },
            tokenIssuer: {
                secret: TURSO_TOKEN_SECRET,
            },
        }),
    ],
);
```

# Endpoints

The package exposes Turso through a single provider path.

| Method | Path | Description |
|---|---|---|
| `GET` | `/turso` | Read rows or count rows. |
| `POST` | `/turso` | Create a row. |
| `PUT` | `/turso` | Update rows. |
| `DELETE` | `/turso` | Delete rows. |
| `POST` | `/turso/token` | Issue a scoped short-lived token. |

`GET /turso` uses query parameters.

```text
/turso?database=main&table=users&indexKey=user_1
```

Collection queries can pass `where`, `orderBy`, and `limit`.

```text
/turso?database=main&table=users&where=[{"type":"equalTo","key":"name","value":"Alice"}]&orderBy=[{"key":"created_at","descending":true}]&limit=20
```

Supported `where` types are `equalTo`, `notEqualTo`, `lessThan`,
`lessThanOrEqualTo`, `greaterThan`, `greaterThanOrEqualTo`, `whereIn`,
`whereNotIn`, `isNull`, `isNotNull`, and `like`.

`POST` / `PUT` / `DELETE` use JSON bodies.

```json
{
  "database": "main",
  "table": "users",
  "indexKey": "user_1",
  "value": {
    "name": "Alice"
  }
}
```

# Database and schema management

The worker can create Turso databases and tables automatically.

```typescript
m.Functions.turso({
    organizationName: TURSO_ORGANIZATION_NAME,
    groupName: TURSO_GROUP_NAME,
    platformApiToken: TURSO_PLATFORM_API_TOKEN,
    defaultDatabase: "main",
    autoCreateDatabase: true,
    autoCreateTable: true,
    autoMigrateAddColumns: true,
});
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

# Scoped short-lived token

Use `/turso/token` to issue a token after filtering the requested scope through `rules`.

```json
{
  "database": "main",
  "scope": [
    {
      "table": "users",
      "operations": ["read"]
    }
  ],
  "ttlSeconds": 600
}
```

The response is:

```json
{
  "token": "<jwt>",
  "expiresAt": 1760000000
}
```

`ttlSeconds` defaults to 600 seconds and is capped by `maxTtlSeconds` (default: 3600 seconds).

When `organizationName` and `platformApiToken` are configured, tokens are generated with the Turso Platform API:

```text
POST /v1/organizations/{organizationSlug}/databases/{databaseName}/auth/tokens
```

If Platform API settings are not available, the worker falls back to a local HS256 JWT signed with `tokenIssuer.secret` or `authToken`.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
