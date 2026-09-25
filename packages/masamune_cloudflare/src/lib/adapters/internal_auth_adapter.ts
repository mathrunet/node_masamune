import { Context, MiddlewareHandler } from "hono";
import { WorkersAuthAdapterBase } from "../src/workers_auth_adapter_base";
import {
    getInternalSecret,
    masamuneInternalSecretEnv,
    verifyInternalRequest,
} from "../src/internal_request";

/**
 * Options for [InternalAuthAdapter].
 */
export interface InternalAuthOptions {
    /**
     * Name of the environment variable that stores the shared secret.
     *
     * Defaults to [masamuneInternalSecretEnv].
     */
    secretEnv?: string | undefined;

    /**
     * Maximum allowed clock skew in seconds. Defaults to 300.
     */
    maxSkewSeconds?: number | undefined;

    /**
     * Response returned when verification fails.
     */
    unauthorizedResponse?: (context: Context) => Response | Promise<Response>;
}

/**
 * Middleware that accepts only internal requests signed with the shared secret.
 *
 * Use it for endpoints called by [fetchInternal] from other Workers.
 */
export class InternalAuthAdapter extends WorkersAuthAdapterBase {
    constructor(options: InternalAuthOptions = {}) {
        super();
        this.options = options;
    }

    private readonly options: InternalAuthOptions;

    build(): MiddlewareHandler {
        return async (context, next) => {
            const secret = getInternalSecret(
                context.env,
                this.options.secretEnv ?? masamuneInternalSecretEnv,
            );
            const verified = await verifyInternalRequest(
                context.req.raw,
                secret,
                { maxSkewSeconds: this.options.maxSkewSeconds },
            );
            if (!verified) {
                if (this.options.unauthorizedResponse) {
                    return await this.options.unauthorizedResponse(context);
                }
                return context.json({ error: "Unauthorized" }, 401);
            }
            this.setAuthContext(context, {});
            await next();
        };
    }
}
