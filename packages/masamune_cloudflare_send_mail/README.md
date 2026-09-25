<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Masamune Cloudflare Send Mail for Cloudflare Workers</h1>
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


Masamune framework package plugin for sending mail through [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) (Email Sending, beta) from Cloudflare Workers.

Two transports are supported.

| Transport | Use it when | How it sends |
| --- | --- | --- |
| `binding` | The sender domain is onboarded on the **same** Cloudflare account as the Worker. | Workers `send_email` binding (`env.EMAIL.send()`). |
| `api` | The sender domain is onboarded on **another** Cloudflare account. | REST API `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send` with an API token. |

Also, [masamune_functions_cloudflare](https://pub.dev/packages/masamune_functions_cloudflare) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune_cloudflare_send_mail
```

Before sending, onboard the sender domain in the Cloudflare dashboard under **Compute** > **Email Service** > **Email Sending** > **Onboard Domain**. The domain must use Cloudflare DNS. See [Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/).

# Setup

## Binding transport

Add a `send_email` binding to your Wrangler configuration.

```jsonc
// wrangler.jsonc
{
  "send_email": [
    // "remote": true lets `wrangler dev` send real emails through the remote binding.
    { "name": "EMAIL", "remote": true }
  ]
}
```

```toml
# wrangler.toml
[[send_email]]
name = "EMAIL"
remote = true
```

The binding can be restricted with `allowed_sender_addresses`, `allowed_destination_addresses` or `destination_address`. See [Configure send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

If you use a binding name other than `EMAIL`, set it with the `bindingName` option or the `MAIL_CLOUDFLARE_BINDING` variable.

## REST API transport

1. On the account that owns the sender domain, [create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with the **Email Sending: Edit** permission.
2. Copy the [account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/) of that account.
3. Register them in the Worker that sends mail.

```bash
npx wrangler secret put MAIL_CLOUDFLARE_API_TOKEN
```

```jsonc
// wrangler.jsonc
{
  "vars": {
    "MAIL_CLOUDFLARE_ACCOUNT_ID": "<account_id>"
  }
}
```

Never commit the API token. For local development, put it in `.dev.vars`.

# Implementation

## Library

```typescript
import { sendMail, SendMailError } from "@mathrunet/masamune_cloudflare_send_mail";

interface Env {
  EMAIL: SendEmail; // From @cloudflare/workers-types. Any object with a compatible send() works.
  MAIL_CLOUDFLARE_ACCOUNT_ID: string;
  MAIL_CLOUDFLARE_API_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const result = await sendMail({
        // Same-account domain:
        transport: { type: "binding", binding: env.EMAIL },
        // Another account's domain:
        // transport: { type: "api", accountId: env.MAIL_CLOUDFLARE_ACCOUNT_ID, apiToken: env.MAIL_CLOUDFLARE_API_TOKEN },
        message: {
          from: { email: "welcome@yourdomain.com", name: "Your Service" },
          to: ["user@example.com", { email: "jane@example.com", name: "Jane Doe" }],
          replyTo: "support@yourdomain.com",
          subject: "Welcome!",
          text: "Thanks for signing up.",
          html: "<h1>Welcome!</h1><p>Thanks for signing up.</p>",
        },
      });
      return Response.json(result);
    } catch (e) {
      if (e instanceof SendMailError) {
        // e.retryable is true for 429 / 5xx / network errors and retryable binding errors.
        return Response.json({ error: e.message, code: e.code }, { status: e.retryable ? 503 : 400 });
      }
      throw e;
    }
  },
};
```

### Message

| Field | Type | Notes |
| --- | --- | --- |
| `to` | `string \| SendMailAddress \| Array<string \| SendMailAddress>` | Required. |
| `cc`, `bcc` | same as `to` | Optional. `to` + `cc` + `bcc` must not exceed 50 addresses. |
| `from` | `string \| SendMailAddress` | Required. Must belong to an onboarded domain. |
| `replyTo` | `string \| SendMailAddress` | Optional. |
| `subject` | `string` | Required. |
| `text`, `html` | `string` | At least one is required. |
| `headers` | `Record<string, string>` | Optional. Only [allowed headers](https://developers.cloudflare.com/email-service/reference/headers/). |

`SendMailAddress` is `{ email: string; name?: string }`. It is converted to `{ email, name }` for the binding and to `{ address, name }` for the REST API. `replyTo` is sent as `replyTo` to the binding and as `reply_to` to the REST API.

### Result

| Field | `binding` | `api` |
| --- | --- | --- |
| `messageId` | `messageId` returned by `send()` | `result.message_id` |
| `delivered` | always `[]` | `result.delivered` |
| `queued` | always `[]` | `result.queued` |
| `permanentBounces` | always `[]` | `result.permanent_bounces` |
| `suppressedRecipients` | not set | `result.suppressed_recipients` when returned |

The binding does not report per-recipient status; a resolved promise means Cloudflare accepted the message.

### Errors

`sendMail` throws `SendMailError` with `status`, `code` and `retryable`.

- Invalid input: `code` is `INVALID_MESSAGE` or `INVALID_TRANSPORT`. Nothing is sent.
- `binding`: `code` is the binding error code (e.g. `E_SENDER_NOT_VERIFIED`). `E_RATE_LIMIT_EXCEEDED` and `E_INTERNAL_SERVER_ERROR` are retryable.
- `api`: `status` is the HTTP status and `code` is the first Cloudflare error code (e.g. `10001`). 429 and 5xx are retryable, other 4xx are not. Network failures use `NETWORK_ERROR` and are retryable.

The API token is never included in error messages.

## Functions

Import the package as follows and pass the list of functions you wish to define to the `deploy` function.

```typescript
import * as m from "@mathrunet/masamune_cloudflare_send_mail";

export default m.deploy([
  // POST /send_mail
  m.Functions.sendMail(),
]);
```

The transport is resolved in the following order.

1. The `transport` option.
2. The `send_email` binding named `bindingName` / `MAIL_CLOUDFLARE_BINDING` / `EMAIL` in the Workers env (skipped when `type: "api"`).
3. The REST API with `accountId` / `MAIL_CLOUDFLARE_ACCOUNT_ID` and `apiToken` / `MAIL_CLOUDFLARE_API_TOKEN` (skipped when `type: "binding"`).

```typescript
m.Functions.sendMail({
  auth: new m.NoneAuthAdapter(), // Configure an appropriate authentication adapter in production.
  type: "api",
  accountId: "<account_id>",
});
```

Request body:

```json
{
  "from": "welcome@yourdomain.com",
  "to": "user@example.com",
  "subject": "Welcome!",
  "text": "Thanks for signing up.",
  "html": "<h1>Welcome!</h1>"
}
```

Response body:

```json
{
  "success": true,
  "messageId": "<id@yourdomain.com>",
  "delivered": ["user@example.com"],
  "queued": [],
  "permanentBounces": []
}
```

Invalid input returns 400, rate limiting returns 429, and other failures return 500 with `{ "error": "..." }`.

Anyone who can call this endpoint can send mail from your domain. Always protect it with an authentication adapter and rules, and restrict senders with `allowed_sender_addresses` where possible.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
