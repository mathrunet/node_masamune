import { MiddlewareHandler } from "hono";
import { WorkersAuthenticationMiddlewareBase } from "../src/workers_authentication_middleware_base";

/**
 * Middleware that does not perform authentication.
 *
 * 認証を行わないミドルウェア。
 */
export class NoAuthenticationMiddleware extends WorkersAuthenticationMiddlewareBase {
    build(): MiddlewareHandler {
        return async (_, next) => {
            await next();
        };
    }
}
