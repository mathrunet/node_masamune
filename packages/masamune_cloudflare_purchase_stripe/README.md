<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Stripe for Cloudflare Workers</h1>
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

Masamune framework plugin package for billing with Stripe on Cloudflare Workers.

# Installation

Install the following package:

```bash
npm install @mathrunet/masamune_cloudflare_purchase_stripe
```

# Implementation

## Features

Provides payment actions equivalent to `@mathrunet/masamune_firebase_purchase_stripe` and a Stripe Meter library for usage-based billing. All operations use the `stripe` SDK configured for Workers with `createFetchHttpClient`.

### Payment Endpoints (Functions)

- `stripe` — payment actions selected by `mode` (POST with a JSON body)
  - Connect: `create_account` / `delete_account` / `get_account` / `dashboard_account`
  - Customers and payment methods: `create_customer_and_payment` / `set_customer_default_payment` / `delete_payment` / `delete_customer`
  - Authorization: `authorization` / `confirm_authorization`
  - Payments: `create_purchase` / `confirm_purchase` / `capture_purchase` / `refresh_purchase` / `cancel_purchase` / `refund_purchase`
  - Subscriptions: `create_subscription` / `delete_subscription`
- `stripeWebhook` — receives Stripe webhooks (signature verification required). Processes PaymentIntent, payment method, customer, Checkout, and subscription events (creation/update/trial end/deletion) and synchronizes them to the store.
- `stripeWebhookConnect` — Stripe Connect webhook (`account.updated`)
- `stripeWebhookSecure` — redirect webhook after 3D Secure authentication

Data is stored through `StripePurchaseStore` instead of Firestore. The default is D1's `D1StripePurchaseStore` (`stripe_users` / `stripe_payments` / `stripe_purchases`). Table names are configurable, and custom storage can be substituted by implementing `StripePurchaseStore`.

```typescript
import { Hono } from "hono";
import { Functions } from "@mathrunet/masamune_cloudflare_purchase_stripe";

const app = new Hono();
app.route("/stripe/webhook", Functions.stripeWebhook().build());
app.route("/stripe", Functions.stripe().build());
```

To keep Worker bundles small, import builders directly from the `dist/purchase` entry point (root imports include re-exports of the entire Masamune framework).

```typescript
import { Hono } from "hono";
import {
  buildStripeWebhook,
  D1StripePurchaseStore,
} from "@mathrunet/masamune_cloudflare_purchase_stripe/dist/purchase";

const app = buildStripeWebhook(new Hono(), {
  secretKey: env.STRIPE_SECRET_KEY,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  store: () => new D1StripePurchaseStore(env.DB),
}, {});
```

### D1 Schema (Default)

```sql
CREATE TABLE stripe_users (
  user_id TEXT PRIMARY KEY,
  customer_id TEXT,
  account_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_stripe_users_customer ON stripe_users(customer_id);
CREATE INDEX idx_stripe_users_account ON stripe_users(account_id);

CREATE TABLE stripe_payments (
  user_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, payment_id)
);

CREATE TABLE stripe_purchases (
  order_id TEXT PRIMARY KEY,
  user_id TEXT,
  purchase_id TEXT,
  subscription_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_stripe_purchases_user ON stripe_purchases(user_id);
CREATE INDEX idx_stripe_purchases_purchase ON stripe_purchases(purchase_id);
CREATE INDEX idx_stripe_purchases_subscription ON stripe_purchases(subscription_id);
```

### Stripe Meter Library (Usage-Based Billing)

- `recordUsage` — records usage events. Inserts them into D1 (the source of truth) and flushes to Stripe when the KV buffer is full (default 10 units) or the time threshold is reached (default 60 seconds).
- `flushStripeMeter` — aggregates unsent events by customer and sends batches to the Stripe Meter Event API (`/v1/billing/meter_events`, basil or later). Each batch uses a unique identifier for idempotency. Failed events remain unsent and are retried on the next run.
- `D1UsageEventStore` / `KVUsageBuffer` — bundled D1 and KV adapters. Table names, column names, and key prefixes are configurable. Substitute custom storage by implementing `StripeUsageEventStore` / `StripeUsageBuffer`.
- `StripeMeterClient` — uses the `stripe` SDK with a fetch HTTP client. Tests can inject `fetch` or `stripeClient` stubs.

To keep Worker bundles small when using only the Meter library, import from the `dist/meter` entry point (root imports include re-exports of the entire Masamune framework).

```typescript
import {
  D1UsageEventStore,
  KVUsageBuffer,
  StripeMeterClient,
  recordUsage,
} from "@mathrunet/masamune_cloudflare_purchase_stripe/dist/meter";

// For example, at the end of request handling (waitUntil recommended)
await recordUsage({
  store: new D1UsageEventStore(env.DB),
  buffer: new KVUsageBuffer(env.USAGE_BUFFER),
  client: new StripeMeterClient({
    secretKey: env.PURCHASE_STRIPE_SECRETKEY,
    eventName: env.PURCHASE_STRIPE_METER_EVENT_NAME ?? "my_meter",
  }),
  customerKey: apiKey.id,
  stripeCustomerId: apiKey.stripe_customer_id,
  endpoint: "decide",
  units: 1,
});
```

If the secret key or the customer's Stripe customer ID is missing, sending is skipped and usage is recorded only in D1.

## Environment Variables

- `PURCHASE_STRIPE_SECRETKEY` — Stripe secret key (Worker secret)
- `PURCHASE_STRIPE_METER_EVENT_NAME` — Stripe Meter event name
- `PURCHASE_STRIPE_WEBHOOKSECRET` — signing secret for the main webhook (Worker secret)
- `PURCHASE_STRIPE_WEBHOOKCONNECTSECRET` — signing secret for the Connect webhook (Worker secret)
- `PURCHASE_STRIPE_EMAILPROVIDER` — 3D Secure email provider (default `sendgrid`)
- `MAIL_SENDGRID_APIKEY` — SendGrid API key (required only for 3D Secure email; Worker secret)

The Firebase implementation's email lookup through `admin.auth()` is replaced by an injected `options.resolveUserEmail`, the user document's `email` field, or the default payment method's billing details.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
