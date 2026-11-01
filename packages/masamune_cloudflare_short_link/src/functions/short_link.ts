import { Context, Hono } from "hono";
import { ShortLinkWorkersOptions } from "../lib/interface";
import { buildShortLinkDestination, isShortLinkExpired, isValidShortLinkCode, resolveShortLinkStore } from "../lib/short_link";

/**
 * Redirect `GET /<code>` to the destination of the short link stored in KV.
 *
 * KVに保存された短縮リンクのリダイレクト先へ`GET /<code>`をリダイレクトします。
 */
module.exports = (
    hono: Hono,
    options: ShortLinkWorkersOptions,
    data: { [key: string]: any },
) => {
    const notFound = (context: Context) => {
        if (options.notFoundUrl) {
            return redirect(options.notFoundUrl);
        }
        return context.text("Not Found", 404, { "Cache-Control": "no-store" });
    };
    hono.get("/:code", async (context: Context) => {
        const code = context.req.param("code") ?? "";
        if (!isValidShortLinkCode(code)) {
            return notFound(context);
        }
        try {
            const store = resolveShortLinkStore(context, options);
            const record = await store.get(code);
            if (!record || isShortLinkExpired(record)) {
                return notFound(context);
            }
            let destination: URL | string = buildShortLinkDestination(record);
            if (options.resolveDestination) {
                destination = await options.resolveDestination(record, destination, (context.env ?? {}) as Record<string, unknown>);
            }
            return redirect(destination.toString());
        } catch (err) {
            console.error(err);
            return notFound(context);
        }
    });
    return hono;
};

function redirect(location: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            "Location": location,
            // Do not cache so that edits take effect immediately.
            "Cache-Control": "private, max-age=0, no-store",
            "Referrer-Policy": "no-referrer-when-downgrade",
            "X-Robots-Tag": "noindex",
        },
    });
}
