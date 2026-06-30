import { MiddlewareHandler } from "hono";
import { WorkersAuthAdapterBase } from "../src/workers_auth_adapter_base";

/**
 * Adapter that does not perform authentication.
 *
 * 認証を行わないアダプター。
 */
export class NoneAuthAdapter extends WorkersAuthAdapterBase {
    build(): MiddlewareHandler {
        return async (_, next) => {
            await next();
        };
    }
}
