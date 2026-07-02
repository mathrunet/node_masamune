import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { CloudflareKvWorkersOptions } from "../src/lib/types";

const allowRules = {
  version: "1",
  rules: {
    database: {
      "**": {
        read: "allow",
        write: "allow",
      },
    },
  },
} as const;

const denyRules = {
  version: "1",
  rules: {
    database: {
      "**": {
        read: "deny",
        write: "deny",
      },
    },
  },
} as const;

function options(
  value: Partial<CloudflareKvWorkersOptions> = {},
): CloudflareKvWorkersOptions {
  return {
    rules: allowRules,
    ...value,
  };
}

function createNamespace(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    namespace: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      put: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
}

describe("Cloudflare KV Workers", () => {
  test("exposes WorkersData using the existing Functions pattern", () => {
    const worker = Functions.kv(options());

    expect(worker.path).toBe("/kv");
  });

  test("reads a document by using the model path as the KV key", async () => {
    const { namespace } = createNamespace({
      "config/app": JSON.stringify({ enabled: true, version: 2 }),
    });
    const app = deploy([Functions.kv(options())]);

    const response = await app.request(
      "http://localhost/kv/document/config/app",
      undefined,
      { MASAMUNE_KV: namespace },
    );
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ enabled: true, version: 2 });
    expect(namespace.get).toHaveBeenCalledWith("config/app", "text");
  });

  test("reads a document as a __default__ pseudo collection", async () => {
    const { namespace } = createNamespace({
      "config/app": JSON.stringify({ enabled: true }),
    });
    const app = deploy([Functions.kv(options())]);

    const response = await app.request(
      "http://localhost/kv/collection/config/app",
      undefined,
      { MASAMUNE_KV: namespace },
    );
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ __default__: { enabled: true } });
  });

  test("saves a document as a JSON string", async () => {
    const { namespace, store } = createNamespace();
    const app = deploy([Functions.kv(options())]);

    const response = await app.request(
      "http://localhost/kv/document/config/app",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: { enabled: false, title: "App" } }),
      },
      { MASAMUNE_KV: namespace },
    );
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ enabled: false, title: "App" });
    expect(store.get("config/app")).toBe(JSON.stringify({
      enabled: false,
      title: "App",
    }));
  });

  test("deletes a document by key", async () => {
    const { namespace, store } = createNamespace({
      "config/app": JSON.stringify({ enabled: true }),
    });
    const app = deploy([Functions.kv(options())]);

    const response = await app.request(
      "http://localhost/kv/document/config/app",
      { method: "DELETE" },
      { MASAMUNE_KV: namespace },
    );

    expect(response.status).toBe(200);
    expect(store.has("config/app")).toBe(false);
  });

  test("returns 403 when rules deny access", async () => {
    const { namespace } = createNamespace({
      "config/app": JSON.stringify({ enabled: true }),
    });
    const app = deploy([Functions.kv(options({ rules: denyRules }))]);

    const response = await app.request(
      "http://localhost/kv/document/config/app",
      undefined,
      { MASAMUNE_KV: namespace },
    );

    expect(response.status).toBe(403);
  });

  test("returns 500 when KV binding is missing", async () => {
    const app = deploy([Functions.kv(options())]);

    const response = await app.request(
      "http://localhost/kv/document/config/app",
    );

    expect(response.status).toBe(500);
  });
});
