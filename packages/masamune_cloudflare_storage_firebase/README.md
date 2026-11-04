<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Firebase Storage for Cloudflare Workers</h1>
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


Operate Firebase Storage (Cloud Storage for Firebase) from Cloudflare Workers.

It talks to the Cloud Storage JSON API with a service account, using only `fetch` and WebCrypto, so it runs on Workers without Node.js SDKs.

- `FirebaseStorageClient`: `head`, `get`, `put` (with `ifGenerationMatch`), `delete`, `list`, `deletePrefix`, `downloadUrl`.
- `createR2CompatibleBucket`: an `R2Bucket` compatible wrapper (`head`, `get`, `put` with `onlyIf`, `delete`, `list`) so that code written for R2 can move to Firebase Storage by replacing the binding.
- `Functions.storageFirebase`: a Worker endpoint with the same request format as `storageCloudflare` of [@mathrunet/masamune_cloudflare_storage](https://www.npmjs.com/package/@mathrunet/masamune_cloudflare_storage), protected by the `storage` rules.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_storage_firebase
```

# Configuration

Set the following values on the Worker.

| Name | Kind | Description |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT` | secret | Service account JSON that can read and write the bucket (e.g. the Firebase Admin SDK service account). |
| `FIREBASE_PROJECT_ID` | var | Firebase project ID. Used when the service account does not contain `project_id`. |
| `FIREBASE_STORAGE_BUCKET` | var (optional) | Bucket name. Defaults to `<project_id>.firebasestorage.app`. Set it for legacy `<project_id>.appspot.com` buckets. |
| `STORAGE_PUBLIC_BASE_URL` | var (optional) | Base URL used for `publicUri` in `Functions.storageFirebase` responses. |

```bash
wrangler secret put GOOGLE_SERVICE_ACCOUNT < service-account.json
```

# Implementation

## Client

```typescript
import { createFirebaseStorageClient } from "@mathrunet/masamune_cloudflare_storage_firebase";

const client = createFirebaseStorageClient(env);

await client.put("private/user/profile.json", JSON.stringify({ name: "mathru" }), {
    contentType: "application/json",
});
const object = await client.get("private/user/profile.json");
const profile = await object?.json();

// Create only when the object does not exist. Returns null when it already exists.
const created = await client.put("locks/job.json", "{}", { ifGenerationMatch: 0 });

// Optimistic locking with the generation.
const current = await client.head("locks/job.json");
const updated = await client.put("locks/job.json", "{\"done\":true}", {
    ifGenerationMatch: current!.generation,
});

// Delete everything under a prefix.
await client.deletePrefix(`users/${userId}/`);

// Firebase download URL (a token is added when missing).
const url = await client.downloadUrl("public/image.png");
```

## Replacing an R2 binding

```typescript
import {
    createFirebaseStorageClient,
    createR2CompatibleBucket,
} from "@mathrunet/masamune_cloudflare_storage_firebase";

const bucket = createR2CompatibleBucket(createFirebaseStorageClient(env));

const object = await bucket.get("private/state.json");
const next = await bucket.put("private/state.json", JSON.stringify(state), {
    onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
});
if (!next) {
    // Conflict: another request updated the object first.
}
```

The etag maps to the Cloud Storage generation, so `onlyIf` stays atomic.

## Worker endpoint

Pass the return value of the `deploy` function to `export default`.

```typescript
import * as m from "@mathrunet/masamune_cloudflare";
import * as storage from "@mathrunet/masamune_cloudflare_storage_firebase";

export default m.deploy(
    [
        storage.Functions.storageFirebase(),
    ],
    {
        rules: {
            version: "1",
            rules: {
                storage: {
                    "public/**": {
                        read: "allow",
                        write: "authenticated",
                    },
                    "images/{uid}/**": {
                        read: { type: "path", param: "uid" },
                        write: { type: "path", param: "uid", server: true },
                    },
                },
            },
        },
    },
);
```

`POST /storage_firebase` accepts `{ operation: "get" | "put" | "post" | "delete" | "downloadUrl", path, binary, meta }`.
`downloadUrl` returns a Firebase download URL with a token.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
