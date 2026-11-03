<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Firestore REST for Cloudflare Workers</h1>
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


Access Firestore from Cloudflare Workers through the [Firestore REST API](https://firebase.google.com/docs/firestore/reference/rest), authenticated with a Google service account. Only WebCrypto and `fetch` are used, so no Node.js APIs or `firebase-admin` are required.

This package is meant for the **region Worker** (placed near Firestore `nam5`, e.g. `us-east`) to run backend logic such as purchases, notifications and permission changes. It does **not** provide a CRUD relay endpoint: apps read and write Firestore directly with the Flutter Firebase SDK protected by Security Rules and App Check.

# Security model

- The Worker authenticates with a service account (admin privileges). **Firestore Security Rules are NOT applied to these requests.** The Worker code itself is the permission boundary: authenticate the caller and validate every input before writing.
- Data that must not be modified by users (billing, entitlements, roles, etc.) should be written **only** by the region Worker. Deny client writes to those collections in Firestore Security Rules (e.g. a read-only `permission` in Masamune models) so that the Worker is the only writer.
- Clients access Firestore directly with the Flutter SDK. Enable **App Check** (`firebase.app_check.enable: true` in `katana.yaml`) and generated Security Rules (`firebase.firestore.generate_rules_and_indexes: true`).
- Store the service account JSON only as a Worker secret (`GOOGLE_SERVICE_ACCOUNT`). Grant it the minimum role needed (e.g. `roles/datastore.user`).

# Installation

```bash
npm install @mathrunet/masamune_cloudflare_firestore
```

# Setup

## katana.yaml

```yaml
firebase:
  firestore:
    enable: true
    generate_rules_and_indexes: true
    worker_access:
      enable: true  # requires cloudflare.worker.region.enable
  app_check:
    enable: true
```

Put the service account JSON in `katana_secrets.yaml` at `firebase.firestore.service_account` and run `katana apply`. It adds this package to `cloudflare/package.json` and puts `GOOGLE_SERVICE_ACCOUNT` as a secret of the region Worker (`wrangler.region.jsonc`).

## Environment

| Name | Kind | Description |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT` | secret | Service account JSON string. |
| `FIREBASE_PROJECT_ID` | var (optional) | Used when the service account has no `project_id`. |
| `FIRESTORE_DATABASE_ID` | var (optional) | Database ID. Defaults to `(default)`. |

The project ID is resolved in the order: option -> `project_id` of the service account -> `FIREBASE_PROJECT_ID`.

# Usage

```ts
import {
  createFirestoreClient,
  FirestoreFieldValue,
} from "@mathrunet/masamune_cloudflare_firestore";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Authenticate the caller here. Security Rules do not protect this code.
    const firestore = createFirestoreClient(env);

    const user = await firestore.getDocument("user/abc");
    await firestore.setDocument("user/abc", {
      coin: FirestoreFieldValue.increment(100),
      updatedAt: FirestoreFieldValue.serverTimestamp(),
    }, { merge: true });

    const posts = await firestore.runQuery("user/abc/post", {
      where: [{ field: "published", op: "==", value: true }],
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: 20,
    });

    const balance = await firestore.runTransaction(async (tx) => {
      const wallet = await tx.get("wallet/abc");
      const next = (wallet?.data.balance ?? 0) - 30;
      if (next < 0) throw new Error("Insufficient balance.");
      tx.update("wallet/abc", { balance: next });
      tx.create("wallet/abc/history/h1", { amount: -30, at: FirestoreFieldValue.serverTimestamp() });
      return next;
    });

    return Response.json({ user, posts, balance });
  },
};
```

## FirestoreRestClient

| Method | Description |
| --- | --- |
| `getDocument(path)` | Get a document. Returns `null` if missing. |
| `batchGet(paths)` | Get documents in one request, in the requested order. |
| `createDocument(collectionPath, data, { documentId? })` | Create a document (fails if it exists). A random ID is generated if omitted. |
| `setDocument(path, data, { merge?, updateMask?, precondition? })` | Overwrite, merge or partially update a document. |
| `updateDocument(path, data)` | Update fields of an existing document. Keys may be dotted field paths. |
| `deleteDocument(path, { exists? })` | Delete a document. |
| `runQuery(collectionPath, query)` | Run a structured query (`where`, `orderBy`, `limit`, `offset`, `startAt`/`startAfter`/`endAt`/`endBefore`, `select`, `allDescendants`). |
| `runTransaction(callback, { readOnly?, maxAttempts? })` | `beginTransaction` -> reads -> `commit`. Rolls back on failure and retries the callback when Firestore returns `ABORTED`. |
| `commit(writes)` | Commit `set` / `create` / `update` / `delete` writes atomically. |

Values are converted between JavaScript and Firestore as follows.

| JavaScript | Firestore |
| --- | --- |
| `null` / `undefined` | `nullValue` (`undefined` fields are skipped) |
| `boolean` | `booleanValue` |
| integer `number`, `bigint` | `integerValue` (decoded as `bigint` outside the safe integer range) |
| non-integer `number` | `doubleValue` |
| `Date`, `FirestoreTimestamp` | `timestampValue` (decoded as `Date`, or `FirestoreTimestamp` with `preciseTimestamps: true`) |
| `string` | `stringValue` |
| `Uint8Array` | `bytesValue` |
| `FirestoreReference` | `referenceValue` |
| `FirestoreGeoPoint` | `geoPointValue` |
| `Array` | `arrayValue` |
| plain object | `mapValue` |

Field transforms: `FirestoreFieldValue.increment(n)` (and `DatabaseIncrement`), `FirestoreFieldValue.serverTimestamp()`. `FirestoreFieldValue.delete()` removes a field in `merge` / `updateMask` / `update` writes.

## FirestoreDatabaseAdapter

`FirestoreDatabaseAdapter` implements `DatabaseAdapterBase` from `@mathrunet/masamune_cloudflare`, so it can be passed as `database` to packages such as `@mathrunet/masamune_cloudflare_purchase` and `@mathrunet/masamune_cloudflare_notification`.

```ts
import { createFirestoreDatabaseAdapter } from "@mathrunet/masamune_cloudflare_firestore";

const database = createFirestoreDatabaseAdapter(env);
```

All 12 `DatabaseWhereCondition` types are mapped to Firestore filters. Pagination orders by inequality fields and then by document ID, and returns an opaque cursor. Composite indexes may be required for some combinations of conditions.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
