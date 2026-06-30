declare global {
    interface KVNamespace {
        get(key: string, type: "json"): Promise<unknown | null>;
        put(
            key: string,
            value: string,
            options?: { expirationTtl?: number | undefined },
        ): Promise<void>;
    }

    interface JsonWebKeyWithKid extends JsonWebKey {
        kid: string;
    }
}

export {};
