import {
  QueueProcessWorkdersBase,
  WorkersQueueExecutionContext,
  WorkersQueueMessageBatch,
} from "@mathrunet/masamune_cloudflare";

type R2CreateAction =
  | "PutObject"
  | "CopyObject"
  | "CompleteMultipartUpload";
type R2DeleteAction = "DeleteObject" | "LifecycleDeletion";
type R2EventAction = R2CreateAction | R2DeleteAction;

export interface R2EventNotification {
  account: string;
  action: R2EventAction;
  bucket: string;
  object: {
    key: string;
    size?: number | undefined;
    eTag?: string | undefined;
  };
  eventTime: string;
  copySource?: {
    bucket: string;
    object: string;
  } | undefined;
}

interface R2ObjectBodyLike {
  body: ReadableStream | null;
  httpMetadata?: {
    contentType?: string | undefined;
    cacheControl?: string | undefined;
    contentDisposition?: string | undefined;
    contentEncoding?: string | undefined;
    contentLanguage?: string | undefined;
    cacheExpiry?: Date | undefined;
  } | undefined;
  customMetadata?: Record<string, string> | undefined;
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: ReadableStream,
    options?: {
      httpMetadata?: R2ObjectBodyLike["httpMetadata"];
      customMetadata?: Record<string, string> | undefined;
    },
  ): Promise<unknown>;
}

export interface StorageCloudflareBackupWorkerData {
  sourceBucketBindingName?: string | undefined;
  backupBucketBindingName?: string | undefined;
  sourceBucketName?: string | undefined;
}

const defaultSourceBucketBindingName = "R2_BUCKET";
const defaultBackupBucketBindingName = "R2_BACKUP_BUCKET";
const createActions = new Set<R2EventAction>([
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
]);
const deleteActions = new Set<R2EventAction>([
  "DeleteObject",
  "LifecycleDeletion",
]);

/**
 * Copies the latest source R2 object to a backup R2 bucket.
 *
 * 元R2の最新オブジェクトをバックアップ用R2バケットへコピーします。
 */
export class StorageCloudflareBackupWorker
  extends QueueProcessWorkdersBase<R2EventNotification> {
  constructor(
    private readonly backupData: StorageCloudflareBackupWorkerData = {},
  ) {
    super();
  }

  async process(
    batch: WorkersQueueMessageBatch<R2EventNotification>,
    env: unknown,
    ctx: WorkersQueueExecutionContext,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        const notification = parseNotification(message.body);
        if (!notification) {
          console.error("Invalid R2 event notification.", message.body);
          message.ack();
          continue;
        }
        if (
          this.backupData.sourceBucketName &&
          notification.bucket !== this.backupData.sourceBucketName
        ) {
          console.error(
            `Unexpected R2 source bucket: ${notification.bucket}`,
          );
          message.ack();
          continue;
        }
        if (deleteActions.has(notification.action)) {
          message.ack();
          continue;
        }
        if (!createActions.has(notification.action)) {
          console.error(
            `Unsupported R2 event action: ${notification.action}`,
          );
          message.ack();
          continue;
        }

        const sourceBucket = resolveBucket(
          env,
          this.backupData.sourceBucketBindingName ||
            defaultSourceBucketBindingName,
        );
        const backupBucket = resolveBucket(
          env,
          this.backupData.backupBucketBindingName ||
            defaultBackupBucketBindingName,
        );
        const object = await sourceBucket.get(notification.object.key);
        if (!object?.body) {
          message.ack();
          continue;
        }
        await backupBucket.put(notification.object.key, object.body, {
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
        });
        message.ack();
      } catch (error) {
        console.error("Failed to back up an R2 object.", error);
        message.retry();
      }
    }
  }
}

function resolveBucket(env: unknown, bindingName: string): R2BucketLike {
  const bucket = (env as Record<string, unknown> | undefined)?.[bindingName];
  if (
    !bucket ||
    typeof (bucket as R2BucketLike).get !== "function" ||
    typeof (bucket as R2BucketLike).put !== "function"
  ) {
    throw new Error(`R2 bucket binding is not found: ${bindingName}`);
  }
  return bucket as R2BucketLike;
}

function parseNotification(value: unknown): R2EventNotification | null {
  if (!isRecord(value) || !isRecord(value.object)) {
    return null;
  }
  if (
    typeof value.account !== "string" ||
    typeof value.action !== "string" ||
    typeof value.bucket !== "string" ||
    typeof value.object.key !== "string" ||
    typeof value.eventTime !== "string"
  ) {
    return null;
  }
  const action = value.action as R2EventAction;
  if (!createActions.has(action) && !deleteActions.has(action)) {
    return null;
  }
  return value as unknown as R2EventNotification;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
