import { deploy } from "../src";
import {
  WorkersQueueExecutionContext,
  WorkersQueueMessageBatch,
} from "@mathrunet/masamune_cloudflare";
import {
  Functions,
  R2EventNotification,
} from "../src/functions";

class FakeR2Object {
  readonly body: ReadableStream;

  constructor(
    readonly value: Uint8Array,
    readonly httpMetadata: {
      contentType?: string;
      cacheControl?: string;
    } = {},
    readonly customMetadata: Record<string, string> = {},
  ) {
    this.body = new ReadableStream({
      start: (controller) => {
        controller.enqueue(value);
        controller.close();
      },
    });
  }
}

class FakeR2Bucket {
  readonly objects = new Map<string, {
    value: Uint8Array;
    httpMetadata: {
      contentType?: string;
      cacheControl?: string;
    };
    customMetadata: Record<string, string>;
  }>();
  putError: Error | undefined;

  async get(key: string): Promise<FakeR2Object | null> {
    const object = this.objects.get(key);
    return object
      ? new FakeR2Object(
        object.value,
        object.httpMetadata,
        object.customMetadata,
      )
      : null;
  }

  async put(
    key: string,
    value: ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    if (this.putError) {
      throw this.putError;
    }
    const bytes = await readStream(value);
    this.objects.set(key, {
      value: bytes,
      httpMetadata: options?.httpMetadata ?? {},
      customMetadata: options?.customMetadata ?? {},
    });
  }

  set(
    key: string,
    value: string,
    httpMetadata: {
      contentType?: string;
      cacheControl?: string;
    } = {},
    customMetadata: Record<string, string> = {},
  ): void {
    this.objects.set(key, {
      value: new TextEncoder().encode(value),
      httpMetadata,
      customMetadata,
    });
  }

  text(key: string): string | undefined {
    const value = this.objects.get(key)?.value;
    return value ? new TextDecoder().decode(value) : undefined;
  }
}

function notification(
  action: R2EventNotification["action"] = "PutObject",
  bucket = "source-bucket",
): R2EventNotification {
  return {
    account: "account-id",
    action,
    bucket,
    object: {
      key: "images/hello.txt",
      size: 5,
      eTag: "etag",
    },
    eventTime: "2026-01-01T00:00:00.000Z",
  };
}

function queueMessage(body: unknown) {
  return {
    id: "message-id",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    body,
    attempts: 1,
    ack: jest.fn(),
    retry: jest.fn(),
  };
}

function batch(
  messages: ReturnType<typeof queueMessage>[],
): WorkersQueueMessageBatch {
  return {
    queue: "storage-backup",
    messages,
    ackAll: jest.fn(),
    retryAll: jest.fn(),
  };
}

function createApp() {
  return deploy([
    Functions.storageCloudflareBackup({
      sourceBucketName: "source-bucket",
    }),
  ]);
}

describe("storage_cloudflare_backup worker", () => {
  test("copies an uploaded object and its metadata", async () => {
    const source = new FakeR2Bucket();
    const backup = new FakeR2Bucket();
    source.set(
      "images/hello.txt",
      "hello",
      { contentType: "text/plain", cacheControl: "max-age=60" },
      { owner: "user-1" },
    );
    const message = queueMessage(notification());

    await createApp().queue?.(batch([message]), {
      R2_BUCKET: source,
      R2_BACKUP_BUCKET: backup,
    }, {} as WorkersQueueExecutionContext);

    expect(backup.text("images/hello.txt")).toBe("hello");
    expect(backup.objects.get("images/hello.txt")?.httpMetadata).toEqual({
      contentType: "text/plain",
      cacheControl: "max-age=60",
    });
    expect(backup.objects.get("images/hello.txt")?.customMetadata).toEqual({
      owner: "user-1",
    });
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  test("overwrites the backup with the latest source object", async () => {
    const source = new FakeR2Bucket();
    const backup = new FakeR2Bucket();
    backup.set("images/hello.txt", "old");
    source.set("images/hello.txt", "latest");
    const message = queueMessage(notification());

    await createApp().queue?.(batch([message]), {
      R2_BUCKET: source,
      R2_BACKUP_BUCKET: backup,
    }, {} as WorkersQueueExecutionContext);

    expect(backup.text("images/hello.txt")).toBe("latest");
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  test.each(["DeleteObject", "LifecycleDeletion"] as const)(
    "keeps the backup for %s",
    async (action) => {
      const source = new FakeR2Bucket();
      const backup = new FakeR2Bucket();
      backup.set("images/hello.txt", "backup");
      const message = queueMessage(notification(action));

      await createApp().queue?.(batch([message]), {
        R2_BUCKET: source,
        R2_BACKUP_BUCKET: backup,
      }, {} as WorkersQueueExecutionContext);

      expect(backup.text("images/hello.txt")).toBe("backup");
      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(message.retry).not.toHaveBeenCalled();
    },
  );

  test("keeps the backup when the source object no longer exists", async () => {
    const source = new FakeR2Bucket();
    const backup = new FakeR2Bucket();
    backup.set("images/hello.txt", "backup");
    const message = queueMessage(notification());

    await createApp().queue?.(batch([message]), {
      R2_BUCKET: source,
      R2_BACKUP_BUCKET: backup,
    }, {} as WorkersQueueExecutionContext);

    expect(backup.text("images/hello.txt")).toBe("backup");
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  test("acks invalid events and events from another source bucket", async () => {
    const invalid = queueMessage({ action: "PutObject" });
    const anotherBucket = queueMessage(notification(
      "PutObject",
      "another-bucket",
    ));

    await createApp().queue?.(batch([invalid, anotherBucket]), {
      R2_BUCKET: new FakeR2Bucket(),
      R2_BACKUP_BUCKET: new FakeR2Bucket(),
    }, {} as WorkersQueueExecutionContext);

    expect(invalid.ack).toHaveBeenCalledTimes(1);
    expect(invalid.retry).not.toHaveBeenCalled();
    expect(anotherBucket.ack).toHaveBeenCalledTimes(1);
    expect(anotherBucket.retry).not.toHaveBeenCalled();
  });

  test("retries only the object whose backup write failed", async () => {
    const source = new FakeR2Bucket();
    const backup = new FakeR2Bucket();
    source.set("images/hello.txt", "hello");
    backup.putError = new Error("R2 is unavailable");
    const failed = queueMessage(notification());
    const invalid = queueMessage({ invalid: true });

    await createApp().queue?.(batch([failed, invalid]), {
      R2_BUCKET: source,
      R2_BACKUP_BUCKET: backup,
    }, {} as WorkersQueueExecutionContext);

    expect(failed.retry).toHaveBeenCalledTimes(1);
    expect(failed.ack).not.toHaveBeenCalled();
    expect(invalid.ack).toHaveBeenCalledTimes(1);
    expect(invalid.retry).not.toHaveBeenCalled();
  });
});

async function readStream(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    const value = result.value as Uint8Array;
    chunks.push(value);
    length += value.byteLength;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
