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

Also, [katana_functions_firebase](https://pub.dev/packages/katana_functions_firebase/score) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

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
        m.Functions.tidbToken(),
    ],
);
```

## Configuration

Set the TiDB connection URL as a Cloudflare Workers secret. The database in the
URL is used as the default database.

```bash
wrangler secret put TIDB_CONNECTION_URL
```

```text
mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db
```

This package does not create databases automatically. Create the TiDB database
before using it. Tables and missing columns are created automatically when
models are saved.

For direct client access, configure TiDB `tidb_auth_token` users and register
the JWT secrets used by the token endpoint.

```bash
wrangler secret put TIDB_JWT_ISSUER
wrangler secret put TIDB_JWT_KID
wrangler secret put TIDB_JWT_PRIVATE_KEY_PEM
wrangler secret put TIDB_DIRECT_READ_USERNAME
wrangler secret put TIDB_DIRECT_WRITE_USERNAME
wrangler secret put TIDB_DIRECT_READ_WRITE_USERNAME
```

Example TiDB users:

```sql
CREATE USER 'client_read'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

CREATE USER 'client_write'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

CREATE USER 'client_read_write'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

GRANT SELECT ON `app_db`.* TO 'client_read';
GRANT INSERT, UPDATE, DELETE ON `app_db`.* TO 'client_write';
GRANT SELECT, INSERT, UPDATE, DELETE ON `app_db`.* TO 'client_read_write';
```

TiDB Cloud Starter and Essential clusters require a username prefix. If the
backend connection URL uses a username such as `4M9hEa4vE3S7jAF.root`, create
the direct users with the same prefix:

```sql
CREATE USER '4M9hEa4vE3S7jAF.client_read'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

CREATE USER '4M9hEa4vE3S7jAF.client_write'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

CREATE USER '4M9hEa4vE3S7jAF.client_read_write'
IDENTIFIED WITH 'tidb_auth_token'
REQUIRE TOKEN_ISSUER 'your-issuer';

GRANT SELECT ON `app_db`.* TO '4M9hEa4vE3S7jAF.client_read';
GRANT INSERT, UPDATE, DELETE ON `app_db`.* TO '4M9hEa4vE3S7jAF.client_write';
GRANT SELECT, INSERT, UPDATE, DELETE ON `app_db`.* TO '4M9hEa4vE3S7jAF.client_read_write';
```

When `TIDB_CONNECTION_URL` contains a prefixed username, this package
automatically applies that prefix to `TIDB_DIRECT_READ_USERNAME`,
`TIDB_DIRECT_WRITE_USERNAME`, and `TIDB_DIRECT_READ_WRITE_USERNAME` if those
secret values do not already contain a prefix. The root password in
`TIDB_CONNECTION_URL` is never returned to clients. The token endpoint returns a
short-lived JWT and the direct TiDB username selected by rules.

## Katana CLI

When `cloudflare.tidb.enable` is enabled, `katana apply` adds the Workers
functions, installs the package, generates JWT/direct-user settings into
`katana_secrets.yaml`, and stores them with `wrangler secret put`.

```yaml
cloudflare:
  tidb:
    enable: true
    connection_url: mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db
```

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
