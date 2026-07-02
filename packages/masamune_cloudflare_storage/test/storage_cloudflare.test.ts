import { deploy } from "../src";
import { Functions } from "../src/functions";

class FakeR2Object {
  readonly size: number;
  readonly body: ReadableStream;

  constructor(
    readonly value: Uint8Array,
    readonly httpMetadata: { contentType?: string } = {},
    readonly customMetadata: Record<string, string> = {},
  ) {
    this.size = value.byteLength;
    this.body = new ReadableStream({
      start: (controller) => {
        controller.enqueue(value);
        controller.close();
      },
    });
  }

  readonly uploaded = new Date("2026-01-01T00:00:00.000Z");

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.value.buffer.slice(
      this.value.byteOffset,
      this.value.byteOffset + this.value.byteLength,
    ) as ArrayBuffer;
  }
}

class FakeR2Bucket {
  readonly objects = new Map<string, FakeR2Object>();

  async get(key: string): Promise<FakeR2Object | null> {
    return this.objects.get(key) ?? null;
  }

  async put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: Record<string, string> | undefined;
      customMetadata?: Record<string, string> | undefined;
    },
  ): Promise<void> {
    this.objects.set(
      key,
      new FakeR2Object(
        value,
        { contentType: options?.httpMetadata?.contentType },
        options?.customMetadata ?? {},
      ),
    );
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

const env = (bucket: FakeR2Bucket) => ({
  R2_BUCKET: bucket,
  STORAGE_DOWNLOAD_URL_SECRET: "test-secret",
});

function createApp() {
  return deploy([
    Functions.storageCloudflare(),
  ], {
    rules: {
      version: "1",
      rules: {
        storage: {
          "public/**": {
            read: "allow",
            write: "allow",
          },
          "private/**": {
            read: "deny",
            write: "deny",
          },
        },
      },
    },
  });
}

describe("storage_cloudflare worker", () => {
  test("uploads and downloads an object", async () => {
    const app = createApp();
    const bucket = new FakeR2Bucket();

    const upload = await app.request("http://localhost/storage_cloudflare", {
      method: "POST",
      body: JSON.stringify({
        operation: "put",
        path: "public/hello.txt",
        binary: btoa("hello"),
        meta: { contentType: "text/plain" },
      }),
      headers: { "Content-Type": "application/json" },
    }, env(bucket));
    expect(upload.status).toBe(200);

    const download = await app.request("http://localhost/storage_cloudflare", {
      method: "POST",
      body: JSON.stringify({
        operation: "get",
        path: "public/hello.txt",
      }),
      headers: { "Content-Type": "application/json" },
    }, env(bucket));
    const body = await download.json() as { binary: string; meta: { contentType: string } };

    expect(download.status).toBe(200);
    expect(atob(body.binary)).toBe("hello");
    expect(body.meta.contentType).toBe("text/plain");
  });

  test("denies storage paths by rules", async () => {
    const app = createApp();
    const bucket = new FakeR2Bucket();

    const response = await app.request("http://localhost/storage_cloudflare", {
      method: "POST",
      body: JSON.stringify({
        operation: "put",
        path: "private/secret.txt",
        binary: btoa("secret"),
      }),
      headers: { "Content-Type": "application/json" },
    }, env(bucket));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
  });

  test("creates a limited download URL", async () => {
    const app = createApp();
    const bucket = new FakeR2Bucket();
    await bucket.put("public/hello.txt", new TextEncoder().encode("hello"));

    const response = await app.request("http://localhost/storage_cloudflare", {
      method: "POST",
      body: JSON.stringify({
        operation: "downloadUrl",
        path: "public/hello.txt",
        expiresIn: 60,
      }),
      headers: { "Content-Type": "application/json" },
    }, env(bucket));
    const body = await response.json() as { meta: { downloadUri: string } };

    expect(response.status).toBe(200);
    expect(body.meta.downloadUri).toContain("/storage_cloudflare/download/public/hello.txt");
    expect(body.meta.downloadUri).toContain("signature=");
  });
});
