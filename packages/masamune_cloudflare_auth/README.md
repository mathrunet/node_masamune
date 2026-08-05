<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"s><br/>
  </a>
  <h1 align="center">Masamune Firebase Auth for Cloudflare Workers</h1>
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

Masamune framework package plugin for Firebase Authentication support.

Also, [masamune_functions_cloudflare](https://pub.dev/packages/masamune_functions_cloudflare) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_auth
```

# Implementation

## Katana CLI

Enable the delete-user Worker in `katana.yaml`. Firebase Authentication and
Firebase token verification for Workers must also be enabled.

```yaml
cloudflare:
  workers:
    enable: true
    enable_firebase_auth: true
  authentication:
    delete_user:
      enable: true

firebase:
  project_id: your-firebase-project-id
  authentication:
    enable: true
```

Store the Firebase Admin SDK service account JSON in
`katana_secrets.yaml` (recommended):

```yaml
cloudflare:
  authentication:
    delete_user:
      service_account: |-
        {"type":"service_account", ...}
```

You can alternatively set the same `service_account` field in `katana.yaml`.
When neither field is set, Katana searches for a service account JSON directly
under `cloudflare/`, then under `android/`. Running `katana apply` adds
`@mathrunet/masamune_cloudflare_auth`, registers `Functions.deleteUser()`, and
stores the JSON in the `GOOGLE_SERVICE_ACCOUNT` Wrangler secret. The service
account must already have the `firebaseauth.users.delete` IAM permission;
Katana does not modify IAM roles.

## Manual setup

Store a Firebase service account JSON as a Cloudflare Workers secret. The service account must have the `firebaseauth.users.delete` IAM permission (for example, the Firebase Authentication Admin role).

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
```

Import the package and add `Functions.deleteUser()` to the Workers deployment.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_auth";

// Define [m.Functions.xxxx] for the functions to be added to Workers.
//
// Workersに追加する機能を[m.Functions.xxxx]を定義してください。
export default m.deploy([
    m.Functions.deleteUser(),
]);
```

The endpoint requires Firebase Authentication through the Workers authentication adapter. It only deletes the authenticated user's own account: the `userId` in the request must match the authenticated UID.

You can also specify the service account and project ID in code. Workers secrets are recommended for production.

```typescript
m.Functions.deleteUser({
    serviceAccount: JSON.stringify(serviceAccount),
    projectId: "your-firebase-project-id",
});
```

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
