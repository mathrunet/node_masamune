/** 既存の予定実行引数を維持し、Workersのglobal型と衝突させない。 */
export interface WorkersScheduledEvent {
    cron: string;
    scheduledTime?: number;
}

declare global {

    interface ExecutionContext {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
    }

    interface KVNamespace {
        get(key: string, type: "text"): Promise<string | null>;
        get(key: string, type: "json"): Promise<unknown | null>;
        put(
            key: string,
            value: string,
            options?: { expirationTtl?: number | undefined },
        ): Promise<void>;
        delete(key: string): Promise<void>;
    }

    interface JsonWebKeyWithKid extends JsonWebKey {
        readonly kid: string;
    }
}

export {};
