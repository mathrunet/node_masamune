<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Masamune Framework for Cloudflare Workers</h1>
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

## Public Entry Points in 3.4.0

Worker bundlers select the Worker-specific entry point using the `workerd` / `browser` conditions. Existing Node entry-point exports are preserved. Shared validation and retry functions have been added for vector synchronization in D1 / Durable Objects / KV.

Scheduled execution arguments use the exported `WorkersScheduledEvent` type. As before, `cron` is required and `scheduledTime` is optional. It can also be used alongside the official Workers `ScheduledEvent` type.

Just load the package in index.ts and pass the predefined data to the methods to implement the server side.

Also, [masamune_functions_cloudflare](https://pub.dev/packages/masamune_functions_cloudflare) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare
```

# Implementation

Pass the return value of the `deploy` function to `export default`. It is defined by passing various Workers to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare";

// Define [m.Functions.xxxx] for the functions to be added to Workers.
export default m.deploy(
    [
        // Worker for Test.
        m.Functions.test(),
    ],
);
```

# Edge and Region Workers

Cloudflare applies Worker placement to a whole Worker, not to each route. Split an application into two Workers when it uses both per-user databases near clients and databases in one fixed region.

| Worker | Entry | Wrangler config | Placement | Typical functions |
|---|---|---|---|---|
| edge | `src/edge.ts` | `wrangler.jsonc` | none (runs near each client) | Turso, KV, R2, D1, Durable Objects |
| region | `src/region.ts` | `wrangler.region.jsonc` | `{ "region": "aws:us-east-1" }` | TiDB and other fixed-region backends |

Pass `type` to `deploy` to add the `x-masamune-worker` response header. Use it to verify which Worker answered a request.

```typescript
// src/edge.ts
import * as m from "@mathrunet/masamune_cloudflare";
import * as turso from "@mathrunet/masamune_cloudflare_turso";
import rules from "./rules.json";

export default m.deploy([
    turso.Functions.turso({ autoCreateDatabase: true }),
    turso.Functions.tursoToken({ autoCreateDatabase: true }),
], { type: "edge", rules: rules as m.RulesConfig, auth: new AuthAdapter() });
```

```typescript
// src/region.ts
import * as m from "@mathrunet/masamune_cloudflare";
import * as tidb from "@mathrunet/masamune_cloudflare_tidb";
import rules from "./rules.json";
import tidbSchemaManifest from "./tidb_schema.json";

export default m.deploy([
    tidb.Functions.tidb({ schemaManifest: tidbSchemaManifest as tidb.SchemaManifest }),
], { type: "region", rules: rules as m.RulesConfig, auth: new AuthAdapter() });
```

```jsonc
// wrangler.region.jsonc
{
  "name": "my-app-region",
  "main": "src/region.ts",
  "placement": { "region": "aws:us-east-1" }
}
```

Both Workers authenticate requests and evaluate rules on their own. Do not forward requests from the edge Worker to the region Worker through a Service Binding; placement applies to `fetch` handlers of the Worker that receives the request. Configure the client with one endpoint per Worker instead, for example `CloudflareFunctionsAdapter(endpoint: "https://my-app-region.<subdomain>.workers.dev")` for `TidbModelAdapter`. Never set placement on the edge Worker, because it would move per-user Turso traffic away from clients.

## Running cron jobs in the region Worker

Placement applies only to `fetch` handlers. A `scheduled` handler does not run near the placed region, so a cron job that talks to TiDB from `scheduled` pays the full round trip. Extend `RegionScheduleProcessWorkdersBase` instead. Its `scheduled` handler sends the event to the Worker itself as a signed internal request, and `run` executes in the `fetch` handler near the backend. The internal route skips Firebase authentication and accepts only requests signed with `MASAMUNE_INTERNAL_SECRET`.

```typescript
// src/region.ts
import * as m from "@mathrunet/masamune_cloudflare";

class CleanupJob extends m.RegionScheduleProcessWorkdersBase {
    path = "/cron/cleanup";

    async run(event: m.WorkersScheduledEvent, env: unknown, ctx: ExecutionContext): Promise<void> {
        // Runs in the fetch handler, near the placed region.
    }
}

export default m.deploy([
    new CleanupJob(),
], { type: "region" });
```

```jsonc
// wrangler.region.jsonc
{
  "name": "my-app-region",
  "main": "src/region.ts",
  "placement": { "region": "aws:us-east-1" },
  "triggers": { "crons": ["*/5 * * * *"] },
  "services": [{ "binding": "SELF", "service": "my-app-region" }]
}
```

Set the secret with `wrangler secret put MASAMUNE_INTERNAL_SECRET --config wrangler.region.jsonc`. The job targets the `SELF` binding by default (`defaultRegionScheduleTarget`). Pass `{ url: "https://my-app-region.<subdomain>.workers.dev" }` as the second constructor argument to send it over HTTPS instead.

## Internal requests between Workers

`fetchInternal(env, target, pathname, body)` sends a `POST` request signed with HMAC-SHA256 (`x-masamune-internal-timestamp` and `x-masamune-internal-signature` headers). It uses the Service Binding `fetch` when `target.binding` is set, and the global `fetch` to `target.url` otherwise. It does not use Service Binding RPC, because placement applies only to `fetch` handlers and an RPC call would run the method outside the placed region. Protect the receiving routes with `InternalAuthAdapter`, or call `verifyInternalRequest(request, secret)` yourself. Requests older than 300 seconds are rejected.

```typescript
const response = await m.fetchInternal(env, { binding: "SELF" }, "/internal/sync", JSON.stringify({ id }));

m.deploy([
    new m.WorkersData({ path: "/internal/sync", options: { auth: new m.InternalAuthAdapter() }, func: (hono) => hono }),
]);
```

# Queue Workers

Extend `QueueProcessWorkdersBase<T>` to add a Cloudflare Queues consumer to the
same `deploy()` entrypoint as HTTP and scheduled Workers.

```typescript
import * as m from "@mathrunet/masamune_cloudflare";

interface Job {
    id: string;
}

class JobWorker extends m.QueueProcessWorkdersBase<Job> {
    async process(
        batch: m.WorkersQueueMessageBatch<Job>,
        env: unknown,
        ctx: m.WorkersQueueExecutionContext,
    ): Promise<void> {
        for (const message of batch.messages) {
            try {
                console.log(message.body.id);
                message.ack();
            } catch (_) {
                message.retry();
            }
        }
    }
}

export default m.deploy([
    new JobWorker(),
]);
```

Add the Queue consumer to `wrangler.jsonc`. `deploy()` exposes the Queue
handler only when at least one Queue Worker is registered, and it can coexist
with HTTP routes and scheduled handlers.

# Rules

`WorkersOptions.rules` accepts a `rules.json` configuration. Import the JSON
file and pass it to `deploy` when multiple Cloudflare packages should share the
same rules.

```typescript
import * as m from "@mathrunet/masamune_cloudflare";
import rulesJson from "../rules.json";

export default m.deploy(
    [
        m.Functions.test(),
    ],
    {
        rules: rulesJson,
    },
);
```

`rules.json` groups rules by target. Database rules and storage rules use the
same path pattern and access rule format.

```json
{
  "version": "1",
  "rules": {
    "database": {
      "main": {
        "read": "allow",
        "write": "server"
      },
      "private_{uid}/users": {
        "read": { "type": "path", "param": "uid" },
        "write": { "type": "field", "field": "ownerId", "server": true }
      }
    },
    "storage": {
      "public/**": {
        "read": "allow",
        "write": "authenticated"
      },
      "images/{uid}/**": {
        "read": { "type": "path", "param": "uid" },
        "write": { "type": "path", "param": "uid", "server": true }
      }
    }
  }
}
```

Named path parameters can occupy a whole segment (`{uid}`) or be embedded in
one (`private_{uid}` or `prefix_{uid}_suffix`). One parameter is allowed per
segment, and its extracted value must not be empty. Exact literal segments take
precedence over embedded parameters, followed by whole-segment parameters, `*`,
and `**`.

Supported access values are `deny`, `allow`, `authenticated`, `server`,
`{ "type": "field", "field": "..." }`, and
`{ "type": "path", "param": "..." }`. `{ "type": "fieldMatch" }` is still
accepted for compatibility.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
