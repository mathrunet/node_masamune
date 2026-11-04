import { Context, Hono } from "hono";
import {
  HttpError,
  RulesEngine,
  RulesOperation,
  WorkersAuthContext,
  WorkersOptions,
  isRulesConfig,
  resolveConfig,
} from "@mathrunet/masamune_cloudflare";
import { FirebaseStorageClient, FirebaseStorageError, FirebaseStorageObject } from "../lib/client";
import { FirebaseStorageEnvironment, createFirebaseStorageClient } from "../lib/env";

type StorageOperation = "get" | "put" | "post" | "delete" | "downloadUrl";

interface StorageRequestBody {
  operation?: StorageOperation | undefined;
  path?: string | undefined;
  binary?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

/**
 * Options for `Functions.storageFirebase`.
 *
 * `Functions.storageFirebase`のオプション。
 */
export interface StorageFirebaseWorkerData extends WorkersOptions {
  /**
   * Firebase Storage bucket name.
   *
   * If not specified, it is resolved from `FIREBASE_STORAGE_BUCKET`, then `<FIREBASE_PROJECT_ID>.firebasestorage.app`.
   */
  bucket?: string | undefined;
  /**
   * Public base URL used to build `publicUri` for stored objects.
   *
   * If not specified (or empty), it is resolved from the `STORAGE_PUBLIC_BASE_URL` environment variable.
   * If neither is configured, `publicUri` is omitted from the response.
   */
  publicBaseUrl?: string | undefined;
}

const defaultPublicBaseUrlBindingName = "STORAGE_PUBLIC_BASE_URL";

module.exports = (
  hono: Hono,
  options: WorkersOptions,
  data: StorageFirebaseWorkerData,
) => {
  hono.post("/", async (context) => handleStorageOperation(context, options, data));
  return hono;
};

async function handleStorageOperation(
  context: Context,
  options: WorkersOptions,
  data: StorageFirebaseWorkerData,
): Promise<Response> {
  try {
    const body = await readBody(context);
    const operation = requireOperation(body.operation);
    const path = normalizeStoragePath(body.path);
    const client = createFirebaseStorageClient(
      context.env as FirebaseStorageEnvironment | undefined,
      { bucket: data.bucket },
    );
    const current = await client.head(path);
    const allowed = await evaluateStorageRules({
      context,
      options,
      path,
      operation: resolveRulesOperation(operation, current),
      current,
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }

    switch (operation) {
      case "get":
        return await getObject(context, client, path, data);
      case "put":
      case "post":
        return await putObject(context, client, path, body, data);
      case "delete":
        await client.delete(path);
        return context.json({ status: 200, message: "File deleted successfully" });
      case "downloadUrl": {
        const downloadUri = await client.downloadUrl(path);
        if (!downloadUri) {
          return context.json({ status: 404, error: "File not found" }, 404);
        }
        return context.json({
          status: 200,
          meta: {
            downloadUri,
            publicUri: createPublicUrl(context, path, data),
          },
        });
      }
    }
  } catch (error) {
    return jsonError(context, error);
  }
}

async function getObject(
  context: Context,
  client: FirebaseStorageClient,
  path: string,
  data: StorageFirebaseWorkerData,
): Promise<Response> {
  const object = await client.get(path);
  if (!object) {
    return context.json({ status: 404, error: "File not found" }, 404);
  }
  return context.json({
    status: 200,
    binary: arrayBufferToBase64(await object.arrayBuffer()),
    meta: {
      ...object.customMetadata,
      contentType: object.contentType,
      size: object.size,
      updated: object.updated?.toISOString(),
      downloadUri: object.downloadTokens[0]
        ? client.buildDownloadUrl(path, object.downloadTokens[0])
        : undefined,
      publicUri: createPublicUrl(context, path, data),
    },
  });
}

async function putObject(
  context: Context,
  client: FirebaseStorageClient,
  path: string,
  body: StorageRequestBody,
  data: StorageFirebaseWorkerData,
): Promise<Response> {
  if (!body.binary) {
    throw new HttpError(400, "No binary data specified for upload operation.");
  }
  const meta = body.meta ?? {};
  const contentType = typeof meta.contentType === "string"
    ? meta.contentType
    : "application/octet-stream";
  const customMetadata = Object.fromEntries(
    Object.entries(meta)
      .filter(([key, value]) => key !== "contentType" && typeof value === "string"),
  ) as Record<string, string>;
  const object = await client.put(path, base64ToUint8Array(body.binary), {
    contentType,
    customMetadata,
    createDownloadToken: true,
  });
  return context.json({
    status: 200,
    message: "File uploaded successfully",
    meta: {
      contentType,
      downloadUri: object?.downloadTokens[0]
        ? client.buildDownloadUrl(path, object.downloadTokens[0])
        : undefined,
      publicUri: createPublicUrl(context, path, data),
    },
  });
}

async function evaluateStorageRules({
  context,
  options,
  path,
  operation,
  current,
}: {
  context: Context;
  options: WorkersOptions;
  path: string;
  operation: RulesOperation;
  current: FirebaseStorageObject | null;
}) {
  const engine = new RulesEngine(isRulesConfig(options.rules) ? options.rules : {
    version: "1",
    rules: {
      storage: {
        "**": {
          read: "deny",
          write: "deny",
        },
      },
    },
  });
  const authentication = context.get("authentication") as WorkersAuthContext | undefined;
  return await engine.evaluate({
    target: "storage",
    path,
    operation,
    authentication,
    fetchDocument: async () => objectMetadataForRules(current),
    server: true,
  });
}

function resolveRulesOperation(
  operation: StorageOperation,
  current: FirebaseStorageObject | null,
): RulesOperation {
  switch (operation) {
    case "get":
    case "downloadUrl":
      return "get";
    case "delete":
      return "delete";
    case "put":
    case "post":
      return current ? "update" : "create";
  }
}

function readBody(context: Context): Promise<StorageRequestBody> {
  return context.req.json<StorageRequestBody>().catch(() => {
    throw new HttpError(400, "JSON body is required.");
  });
}

function requireOperation(operation: StorageOperation | undefined): StorageOperation {
  if (
    operation === "get" ||
    operation === "put" ||
    operation === "post" ||
    operation === "delete" ||
    operation === "downloadUrl"
  ) {
    return operation;
  }
  throw new HttpError(400, "Invalid storage operation.");
}

function createPublicUrl(
  context: Context,
  path: string,
  data: StorageFirebaseWorkerData,
): string | undefined {
  // [data.publicBaseUrl] takes precedence. Falls back to the STORAGE_PUBLIC_BASE_URL env var.
  const baseUrl = resolveConfig(context, data.publicBaseUrl, defaultPublicBaseUrlBindingName);
  if (!baseUrl) {
    return undefined;
  }
  return `${baseUrl.replace(/\/+$/g, "")}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizeStoragePath(path: string | undefined): string {
  const normalized = path?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  if (normalized.length === 0 || normalized.includes("..")) {
    throw new HttpError(400, "Storage path is invalid.");
  }
  return normalized;
}

function objectMetadataForRules(object: FirebaseStorageObject | null): Record<string, unknown> | null {
  if (!object) {
    return null;
  }
  return {
    ...object.customMetadata,
    contentType: object.contentType,
    size: object.size,
    updated: object.updated?.toISOString(),
  };
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function jsonError(context: Context, error: unknown): Response {
  if (error instanceof HttpError || error instanceof FirebaseStorageError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return context.json({
    error: error instanceof Error ? error.message : String(error),
  }, 500);
}
