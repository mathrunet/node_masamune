import {
    Auth,
    EmulatorEnv,
    FirebaseIdToken,
    KeyStorer,
} from "firebase-auth-cloudflare-workers";
import { Context, MiddlewareHandler } from "hono";
import { WorkersAuthenticationMiddlewareBase } from "../src/workers_authentication_middleware_base";

/**
 * Options for Firebase Authentication middleware.
 *
 * Firebase Authenticationミドルウェアのオプション。
 */
export interface FirebaseAuthenticationMiddlewareOptions {
    /**
     * Firebase project ID.
     *
     * FirebaseプロジェクトID。
     */
    projectId: string;

    /**
     * Store for Firebase public keys.
     *
     * Firebase公開鍵の保存先。
     */
    keyStore?: KeyStorer | undefined;

    /**
     * Whether to check if the ID token was revoked.
     *
     * IDトークンの失効を確認するかどうか。
     */
    checkRevoked?: boolean | undefined;

    /**
     * Emulator environment settings.
     *
     * エミュレーター環境設定。
     */
    emulatorEnv?: EmulatorEnv | undefined;

    /**
     * Seconds to tolerate clock skew.
     *
     * 時刻ずれを許容する秒数。
     */
    clockSkewSeconds?: number | undefined;

    /**
     * Authorization header name.
     *
     * Authorizationヘッダー名。
     */
    authorizationHeader?: string | undefined;

    /**
     * Response returned when authentication fails.
     *
     * 認証失敗時に返すレスポンス。
     */
    unauthorizedResponse?: (context: Context, error?: unknown) => Response | Promise<Response>;
}

/**
 * Firebase public key store using the Cloudflare Cache API.
 *
 * Cloudflare Cache APIを利用したFirebase公開鍵ストア。
 */
export class FirebaseCacheApiKeyStorer implements KeyStorer {
    constructor(
        projectId: string,
        cacheName: string = "firebase-pubkeys-v1",
    ) {
        this.cacheKey = new Request(`https://cache.internal/firebase/pubkeys/${projectId}`);
        this.cacheName = cacheName;
    }

    private readonly cacheKey: Request;
    private readonly cacheName: string;

    async get<ExpectedValue = unknown>(): Promise<ExpectedValue | null> {
        const cache = await caches.open(this.cacheName);
        const hit = await cache.match(this.cacheKey);
        if (!hit) {
            return null;
        }
        return await hit.json() as ExpectedValue;
    }

    async put(value: string, expirationTtl: number): Promise<void> {
        const cache = await caches.open(this.cacheName);
        await cache.put(
            this.cacheKey,
            new Response(value, {
                headers: {
                    "content-type": "application/json",
                    "cache-control": `public, max-age=${expirationTtl}`,
                },
            }),
        );
    }
}

/**
 * Middleware for Firebase Authentication.
 *
 * Firebase Authentication用のミドルウェア。
 */
export class FirebaseAuthenticationMiddleware extends WorkersAuthenticationMiddlewareBase {
    constructor(options: FirebaseAuthenticationMiddlewareOptions) {
        super();
        this.options = options;
    }

    private readonly options: FirebaseAuthenticationMiddlewareOptions;

    build(): MiddlewareHandler {
        return async (context, next) => {
            const token = this.getBearerToken(context);
            if (!token) {
                return await this.unauthorized(context);
            }
            try {
                const keyStore = this.options.keyStore ?? new FirebaseCacheApiKeyStorer(this.options.projectId);
                const auth = Auth.getOrInitialize(this.options.projectId, keyStore);
                const decoded = await auth.verifyIdToken(
                    token,
                    this.options.checkRevoked,
                    this.options.emulatorEnv,
                    this.options.clockSkewSeconds,
                );
                this.setAuthenticationContext(context, {
                    uid: decoded.uid,
                    token: decoded as FirebaseIdToken,
                });
                await next();
            } catch (error) {
                return await this.unauthorized(context, error);
            }
        };
    }

    private getBearerToken(context: Context): string | undefined {
        const headerName = this.options.authorizationHeader ?? "Authorization";
        const authorization = context.req.header(headerName);
        if (!authorization) {
            return undefined;
        }
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        return match?.[1];
    }

    private async unauthorized(context: Context, error?: unknown): Promise<Response> {
        if (this.options.unauthorizedResponse) {
            return await this.options.unauthorizedResponse(context, error);
        }
        return context.json({ error: "Unauthorized" }, 401);
    }
}
