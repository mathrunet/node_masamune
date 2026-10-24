<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Masamune Purchase for Cloudflare Workers</h1>
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

Masamune framework plugin package for performing mobile billing checks and managing subscriptions.

Also, [masamune_functions_cloudflare](https://pub.dev/packages/masamune_functions_cloudflare) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_purchase
```

# Implementation

Import the package as follows and pass the list of functions you wish to define to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_purchase";

export default m.deploy([
    // Consumable / non-consumable / subscription verification.
    m.Functions.consumableVerifyIOS({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.nonconsumableVerifyIOS({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.subscriptionVerifyIOS({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.purchaseWebhookIOS({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.consumableVerifyAndroid({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.nonconsumableVerifyAndroid({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.subscriptionVerifyAndroid({ database: new turso.TursoDatabaseAdapter() }),
    m.Functions.purchaseWebhookAndroid({ database: new turso.TursoDatabaseAdapter() }),
], {
    // Required: the verify endpoints bind every write to the authenticated user.
    auth: new m.FirebaseAuthAdapter({ projectId: "your-firebase-project" }),
});
```

When the project is generated with `katana apply` (`cloudflare.workers.enable_firebase_auth: true` and `purchase.enable: true`), the functions, the auth adapter and the secrets below are wired automatically.

# Security model

- **Authenticated user only**: `consumableVerify*`, `nonconsumableVerify*` and `subscriptionVerify*` require an auth adapter that sets `context.get("authentication").uid` (for example `FirebaseAuthAdapter`). Without it they respond `401`.
- **Writes are bound to the caller**:
  - Subscription documents are always saved under `PURCHASE_SUBSCRIPTIONPATH` with `userId` = authenticated UID. A `userId` in the request body must match it (`403` otherwise) and a `path` in the body is ignored. A transaction already owned by another user cannot be re-claimed (`403`).
  - Wallet / unlock `path` values must be `<PURCHASE_USERPATH with {userId} replaced>/<fieldKey>` for the authenticated user (`403` otherwise). The default template is `plugins/iap/user/{userId}`, which matches the Flutter `masamune_purchase` defaults.
  - Extra subscription fields must be sent under `data`; server-managed keys (`userId`, `expired`, `paused`, `token`, …) are stripped.
- **Replay protection**: a consumable receipt that was already applied returns `409`; non-consumable unlocks are idempotent.
- **Apple signatures are fully verified**: StoreKit 2 transaction JWS, App Store Server Notification `signedPayload` and `signedTransactionInfo` are checked against the `x5c` certificate chain anchored to the pinned **Apple Root CA - G3**, including validity periods and Apple's receipt-signing / WWDR extension OIDs. The payload `bundleId` must equal `PURCHASE_IOS_BUNDLEID` and, when configured, `environment` must equal `PURCHASE_IOS_ENVIRONMENT`.
- **Google Play** purchases are verified with the Android Publisher API using the service account; set `PURCHASE_ANDROID_PACKAGENAME` to reject tokens of other packages that the same service account can read.

# Environment variables (Workers secrets)

| Name | Required | Description |
| --- | --- | --- |
| `PURCHASE_SUBSCRIPTIONPATH` | yes | Collection path for subscription documents (katana sets `plugins/iap/subscription`). |
| `PURCHASE_USERPATH` | no | Per-user document template containing `{userId}`. Default `plugins/iap/user/{userId}`. |
| `PURCHASE_IOS_SHAREDSECRET` | StoreKit 1 | App Store shared secret for `/verifyReceipt`. |
| `PURCHASE_IOS_BUNDLEID` | StoreKit 2 / webhook | iOS bundle ID. Signed transactions and notifications of other apps are rejected. |
| `PURCHASE_IOS_ENVIRONMENT` | no | `Production` or `Sandbox`. Both are accepted when unset. |
| `PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL` | Android | Google service account email. |
| `PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY` | Android | Google service account private key. |
| `PURCHASE_ANDROID_PACKAGENAME` | no | Android package name. Requests for other packages are rejected when set. |

All of them can also be passed programmatically through `PurchaseWorkersOptions` (`subscriptionPath`, `userDocumentPath`, `iosSharedSecret`, `iosBundleId`, `iosEnvironment`, `iosRootCertificates`, `androidServiceAccountEmail`, `androidServiceAccountPrivateKey`, `androidPackageName`).

# Migration to 4.x

- Verify endpoints now require an auth adapter. Deployments using `NoneAuthAdapter` (or no adapter) stop working by design.
- `PURCHASE_IOS_BUNDLEID` is required for StoreKit 2 verification and for `purchaseWebhookIOS`. `katana apply` registers it from `ios/Runner.xcodeproj`.
- `subscriptionVerify*` ignore `path` in the request body and no longer merge the whole body into the subscription document. Send additional fields under `data`.
- `verifyJwsWithX5c(token, options)` validates the full certificate chain and only accepts `ES256`. Pass `rootCertificates` to pin a different root (tests).
- Wallet / unlock `path` must point inside the authenticated user's document (`PURCHASE_USERPATH`).

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
