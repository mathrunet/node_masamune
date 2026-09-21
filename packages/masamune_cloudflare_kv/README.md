<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Cloudflare KV for Cloudflare Workers</h1>
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
npm install @mathrunet/masamune_cloudflare_kv
```

# Implementation

Pass the return value of the `deploy` function to `export default`. It is defined by passing various Workers to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_kv";

// Define [m.Functions.xxxx] for the functions to be added to Workers.
export default m.deploy([
    m.Functions.kv({
        bindingName: "MASAMUNE_KV",
    }),
]);
```

Add a KV namespace binding to `wrangler.jsonc`.

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "MASAMUNE_KV",
      "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

The endpoint stores one Masamune document per KV key. The document model path is
used as the KV key without conversion.

```text
key: config/app
value: {"maintenance":false,"version":12}
```

Collection reads are Remote Config compatible pseudo reads. `GET
/kv/collection/config/app` returns the same document under `__default__`.

## Vectorize nearest search

Configure a dedicated SQLite Durable Object coordinator together with the KV
namespace and Vectorize binding. The coordinator persists an intent before any
KV or Vectorize I/O, retries failed deliveries by alarm, and accepts search
results only when the generation and the current KV JSON value still match.

```typescript
import * as kv from "@mathrunet/masamune_cloudflare_kv";
export { KvVectorCoordinator as MasamuneKvVectorCoordinator }
  from "@mathrunet/masamune_cloudflare_kv";

export default kv.deploy([
  kv.Functions.kv({
    bindingName: "MASAMUNE_KV",
    coordinatorBinding: "MASAMUNE_KV_VECTOR_COORDINATOR",
    vectors: [{
      prefix: "items/",
      field: "embedding",
      binding: "VECTORS",
      dimensions: 768,
      metric: "cosine",
    }],
  }),
]);
```

Add `MasamuneKvVectorCoordinator` as a SQLite Durable Object migration and bind
the class, KV namespace, and Vectorize index in `wrangler.jsonc`. Katana CLI
generates these entries from `cloudflare.kv.vectors`. Query with `nearest` JSON
and `limit` on `/kv/collection/<prefix>`. Each returned candidate is checked by
the normal read rules. An update hides the old generation immediately; the new
generation can be absent until Vectorize and KV converge.

Cloudflare KV limits apply. A single value can be up to 25 MiB, and repeated
writes to the same key are limited. KV is eventually consistent, so use Turso or
TiDB for data that requires immediate consistency or frequent writes.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
