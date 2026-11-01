<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"><br/>
  </a>
  <h1 align="center">Masamune Cloudflare Short Link for Cloudflare Workers</h1>
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



Masamune framework package plugin for short links with campaign parameters (UTM) on Cloudflare Workers and [Cloudflare KV](https://developers.cloudflare.com/kv/).

- `https://<your-domain>/s/<code>` redirects (302) to the destination with the stored query parameters such as `utm_source` / `utm_medium` / `utm_campaign`.
- Links are created by operators through a token protected admin API. There is no click counting; analytics tools on the destination (e.g. GA4) read the UTM parameters.
- The same package can be used by any project and any domain.

# Installation

```bash
npm install @mathrunet/masamune_cloudflare_short_link
```

# Setup

## katana.yaml

With `katana apply`, the functions, the KV binding, the zone routes and the admin token secret are configured automatically.

```yaml
cloudflare:
  short_link:
    enable: true
    binding: SHORT_LINK_KV
    namespace_id:
      dev: <dev namespace id>
      prod: <prod namespace id>
    path: s
    allowed_hosts:
      - example.com
      - apps.apple.com
      - play.google.com
    not_found_url: https://example.com/
    routes:
      prod:
        - example.com
    # Optional: an exported function in `cloudflare/src` used as `resolveDestination`.
    resolve_destination:
      name: resolveDestination
      from: ./lib/short_link_destination
```

Create the namespaces beforehand.

```bash
wrangler kv namespace create SHORT_LINK_KV
```

## Manual setup

```ts
import * as m from "@mathrunet/masamune_cloudflare";
import * as shortLink from "@mathrunet/masamune_cloudflare_short_link";

const options = {
  bindingName: "SHORT_LINK_KV",
  allowedHosts: ["example.com", "apps.apple.com", "play.google.com"],
  notFoundUrl: "https://example.com/",
};

export default m.deploy([
  shortLink.Functions.shortLink(options),
  shortLink.Functions.shortLinkAdmin(options),
], { type: "edge" });
```

```jsonc
// wrangler.jsonc (bindings are not inherited by environments, so set them per env)
"kv_namespaces": [{ "binding": "SHORT_LINK_KV", "id": "<namespace id>" }],
"routes": [{ "pattern": "https://example.com/s/*", "zone_name": "example.com" }]
```

```bash
wrangler secret put SHORT_LINK_ADMIN_TOKEN
```

Both functions disable the default authentication adapter and rules (`auth: null`, `rules: null`). The admin API is protected only by `SHORT_LINK_ADMIN_TOKEN`.

# Options

| Option | Default | Description |
| --- | --- | --- |
| `bindingName` | `SHORT_LINK_KV_BINDING` env or `SHORT_LINK_KV` | KV binding name. |
| `keyPrefix` | `short_link:` | Prefix of KV keys. |
| `allowedHosts` | all https hosts | Allowed destination hosts. `*.example.com` allows subdomains. Strongly recommended to prevent open redirects. |
| `notFoundUrl` | 404 | Redirect target when the code does not exist or has expired. |
| `codeLength` | `7` | Length of generated base62 codes. |
| `adminToken` | `SHORT_LINK_ADMIN_TOKEN` env | Bearer token for the admin API. |
| `resolveDestination` | - | Hook to customize the final URL (e.g. convert UTM to App Store `ct` or Google Play `referrer`). |
| `path` | `s` / `short_link` | Mount path of each function. |

# API

## Redirect

`GET /s/<code>` returns `302` with `Location: <url>?<params>`. Parameters stored with the link override the same keys in the URL; query parameters on the short URL itself are ignored. Responses are not cached, so edits take effect within the KV propagation delay (up to about 60 seconds).

## Admin

All requests require `Authorization: Bearer <SHORT_LINK_ADMIN_TOKEN>`.

| Method | Path | Body / Query | Response |
| --- | --- | --- | --- |
| `POST` | `/short_link` | `{ url, params?, code?, note?, expiresAt? }` | `201` record. `409` if `code` exists. |
| `GET` | `/short_link` | `?limit=100&cursor=` | `{ links, cursor? }` |
| `GET` | `/short_link/<code>` | - | record |
| `PUT` | `/short_link/<code>` | `{ url, params?, note?, expiresAt? }` | record |
| `DELETE` | `/short_link/<code>` | - | `{ success: true }` |

```json
{
  "code": "Ab3dE7x",
  "url": "https://example.com/track/1",
  "params": { "utm_source": "x", "utm_medium": "social", "utm_campaign": "launch_en" },
  "note": "Launch post",
  "createdAt": "2026-11-01T00:00:00.000Z",
  "updatedAt": "2026-11-01T00:00:00.000Z"
}
```

`url` must be https without credentials and match `allowedHosts`. `code` must match `^[A-Za-z0-9_-]{3,64}$`. Invalid input returns 400 with `{ "error": "..." }`.

# GitHub Sponsors

Sponsors are always welcome. Thank you for your support!

[https://github.com/sponsors/mathrunet](https://github.com/sponsors/mathrunet)
