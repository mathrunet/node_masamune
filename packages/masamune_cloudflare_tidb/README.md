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
    ],
);
```

## Configuration

Set the TiDB connection URL as a Cloudflare Workers secret. Every CRUD request
must explicitly select its database with the
`database/<database>/<table>/<document_id>` path. The database in the URL is
connection metadata only and is never used as an implicit default.

```bash
wrangler secret put TIDB_CONNECTION_URL
```

```text
mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db
```

This package does not create databases automatically. Create the TiDB database
before using it. Tables and missing columns are created automatically when
models are saved.

All reads and writes go through the Workers CRUD endpoint. The root password in
`TIDB_CONNECTION_URL` is used only inside Cloudflare Workers and is never
returned to clients.

## Katana CLI

When `cloudflare.tidb.enable` is enabled, `katana apply` adds the Workers
functions, installs the package, and stores `TIDB_CONNECTION_URL` with
`wrangler secret put`.

```yaml
cloudflare:
  tidb:
    enable: true
    connection_url: mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db
```

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
