declare global {
    interface ScheduledEvent {
        cron: string;
        scheduledTime?: number;
    }

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
        kid: string;
    }
}

export {};
