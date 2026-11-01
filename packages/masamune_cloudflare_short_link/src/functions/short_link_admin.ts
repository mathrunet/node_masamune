import { Context, Hono, Next } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { ShortLinkWorkersOptions } from "../lib/interface";
import {
    DEFAULT_SHORT_LINK_CODE_LENGTH,
    generateShortLinkCode,
    isValidShortLinkCode,
    resolveShortLinkStore,
    timingSafeEqualString,
    validateShortLinkInput,
} from "../lib/short_link";

const MAX_GENERATE_ATTEMPTS = 5;

/**
 * Admin API to manage short links. Requires `Authorization: Bearer <SHORT_LINK_ADMIN_TOKEN>`.
 *
 * 短縮リンクを管理するAPI。`Authorization: Bearer <SHORT_LINK_ADMIN_TOKEN>`が必要です。
 *
 * - `POST /` create `{ url, params?, code?, note?, expiresAt? }`
 * - `GET /` list `?limit=&cursor=`
 * - `GET /:code` get
 * - `PUT /:code` update `{ url, params?, note?, expiresAt? }`
 * - `DELETE /:code` delete
 */
module.exports = (
    hono: Hono,
    options: ShortLinkWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.use("*", async (context: Context, next: Next) => {
        const token = resolveConfig(context, options.adminToken, "SHORT_LINK_ADMIN_TOKEN");
        if (!token) {
            return jsonError(context, new HttpError(500, "SHORT_LINK_ADMIN_TOKEN is not set."));
        }
        const header = context.req.header("Authorization") ?? "";
        const match = /^Bearer\s+(.+)$/i.exec(header);
        if (!match || !timingSafeEqualString(match[1].trim(), token)) {
            return jsonError(context, new HttpError(401, "Unauthorized."));
        }
        context.header("Cache-Control", "no-store");
        await next();
    });
    hono.get("/", async (context: Context) => {
        try {
            const store = resolveShortLinkStore(context, options);
            const limit = Number(context.req.query("limit") ?? "100");
            const cursor = context.req.query("cursor") || undefined;
            const result = await store.list({ limit: Number.isFinite(limit) ? limit : 100, cursor });
            return context.json(result);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    hono.post("/", async (context: Context) => {
        try {
            const body = await readJson(context);
            const store = resolveShortLinkStore(context, options);
            let code: string;
            if (body.code !== undefined && body.code !== null && body.code !== "") {
                if (!isValidShortLinkCode(body.code)) {
                    throw new HttpError(400, "code must match ^[A-Za-z0-9_-]{3,64}$.");
                }
                code = body.code;
                if (await store.get(code)) {
                    throw new HttpError(409, `The code "${code}" already exists.`);
                }
            } else {
                code = "";
                for (let i = 0; i < MAX_GENERATE_ATTEMPTS; i++) {
                    const candidate = generateShortLinkCode(options.codeLength ?? DEFAULT_SHORT_LINK_CODE_LENGTH);
                    if (!(await store.get(candidate))) {
                        code = candidate;
                        break;
                    }
                }
                if (!code) {
                    throw new HttpError(500, "Failed to generate a unique code.");
                }
            }
            const record = validateShortLinkInput(body, options, { code });
            await store.put(record);
            return context.json(record, 201);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    hono.get("/:code", async (context: Context) => {
        try {
            const store = resolveShortLinkStore(context, options);
            const record = await store.get(context.req.param("code") ?? "");
            if (!record) {
                throw new HttpError(404, "Not found.");
            }
            return context.json(record);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    hono.put("/:code", async (context: Context) => {
        try {
            const body = await readJson(context);
            const store = resolveShortLinkStore(context, options);
            const current = await store.get(context.req.param("code") ?? "");
            if (!current) {
                throw new HttpError(404, "Not found.");
            }
            const record = validateShortLinkInput(body, options, { code: current.code, createdAt: current.createdAt });
            await store.put(record);
            return context.json(record);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    hono.delete("/:code", async (context: Context) => {
        try {
            const code = context.req.param("code") ?? "";
            if (!isValidShortLinkCode(code)) {
                throw new HttpError(404, "Not found.");
            }
            const store = resolveShortLinkStore(context, options);
            await store.delete(code);
            return context.json({ success: true });
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};

async function readJson(context: Context): Promise<Record<string, any>> {
    try {
        const body = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error();
        }
        return body as Record<string, any>;
    } catch {
        throw new HttpError(400, "Request body must be a JSON object.");
    }
}
