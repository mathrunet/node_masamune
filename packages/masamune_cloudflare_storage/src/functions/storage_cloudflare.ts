import { Context, Hono } from "hono";
import {
  RulesEngine,
  RulesOperation,
  WorkersAuthContext,
  WorkersOptions,
  isRulesConfig,
} from "@mathrunet/masamune_cloudflare";

type StorageOperation = "get" | "put" | "post" | "delete" | "downloadUrl";

interface StorageRequestBody {
  operation?: StorageOperation | undefined;
  path?: string | undefined;
  binary?: string | undefined;
  meta?: Record<string, unknown> | undefined;
  expiresIn?: number | undefined;
}

interface R2ObjectBody {
  body: ReadableStream | null;
  size?: number | undefined;
  uploaded?: Date | undefined;
  httpMetadata?: {
    contentType?: string | undefined;
    cacheControl?: string | undefined;
    contentDisposition?: string | undefined;
    contentEncoding?: string | undefined;
    contentLanguage?: string | undefined;
  } | undefined;
  customMetadata?: Record<string, string> | undefined;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2BucketLike {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: Record<string, string> | undefined;
      customMetadata?: Record<string, string> | undefined;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface StorageWorkerData {
  bucketBindingName?: string | undefined;
  publicBaseUrl?: string | undefined;
  downloadUrlSecret?: string | undefined;
  downloadUrlSecretBindingName?: string | undefined;
  downloadBaseUrl?: string | undefined;
  defaultExpiresIn?: number | undefined;
}

const defaultBucketBindingName = "R2_BUCKET";
const defaultDownloadUrlSecretBindingName = "STORAGE_DOWNLOAD_URL_SECRET";
const defaultExpiresIn = 60 * 60;

module.exports = (
  hono: Hono,
  options: WorkersOptions,
  data: StorageWorkerData,
) => {
  hono.post("/", async (context) => handleStorageOperation(context, options, data));
  hono.get("/download/*", async (context) => handleLimitedDownload(context, data));
  return hono;
};

async function handleStorageOperation(
  context: Context,
  options: WorkersOptions,
  data: StorageWorkerData,
): Promise<Response> {
  try {
    const body = await readBody(context);
    const operation = requireOperation(body.operation);
    const path = normalizeStoragePath(body.path);
    const bucket = resolveBucket(context, data);
    const rulesOperation = await resolveRulesOperation(bucket, path, operation);
    const allowed = await evaluateStorageRules({
      context,
      options,
      bucket,
      path,
      operation: rulesOperation,
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }

    switch (operation) {
      case "get":
        return await getObject(context, bucket, path, data);
      case "put":
      case "post":
        return await putObject(context, bucket, path, body, data);
      case "delete":
        await bucket.delete(path);
        return context.json({ status: 200, message: "File deleted successfully" });
      case "downloadUrl":
        return context.json({
          status: 200,
          meta: {
            downloadUri: await createLimitedDownloadUrl(context, path, body.expiresIn, data),
            publicUri: createPublicUrl(path, data),
          },
        });
    }
  } catch (error) {
    return jsonError(context, error);
  }
}

async function getObject(
  context: Context,
  bucket: R2BucketLike,
  path: string,
  data: StorageWorkerData,
): Promise<Response> {
  const object = await bucket.get(path);
  if (!object) {
    return context.json({ status: 404, error: "File not found" }, 404);
  }
  const buffer = await object.arrayBuffer();
  return context.json({
    status: 200,
    binary: arrayBufferToBase64(buffer),
    meta: {
      ...object.customMetadata,
      contentType: object.httpMetadata?.contentType,
      size: object.size,
      updated: object.uploaded?.toISOString(),
      downloadUri: await createLimitedDownloadUrl(context, path, undefined, data),
      publicUri: createPublicUrl(path, data),
    },
  });
}

async function putObject(
  context: Context,
  bucket: R2BucketLike,
  path: string,
  body: StorageRequestBody,
  data: StorageWorkerData,
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
  await bucket.put(path, base64ToUint8Array(body.binary), {
    httpMetadata: { contentType },
    customMetadata,
  });
  return context.json({
    status: 200,
    message: "File uploaded successfully",
    meta: {
      contentType,
      downloadUri: await createLimitedDownloadUrl(context, path, body.expiresIn, data),
      publicUri: createPublicUrl(path, data),
    },
  });
}

async function handleLimitedDownload(
  context: Context,
  data: StorageWorkerData,
): Promise<Response> {
  try {
    const url = new URL(context.req.url);
    const path = extractDownloadPath(url.pathname);
    const expires = Number(url.searchParams.get("expires") ?? "0");
    const signature = url.searchParams.get("signature") ?? "";
    if (!expires || expires < Math.floor(Date.now() / 1000)) {
      throw new HttpError(403, "Download URL has expired.");
    }
    const expected = await signDownloadPath(path, expires, resolveDownloadSecret(context, data));
    if (!constantTimeEquals(signature, expected)) {
      throw new HttpError(403, "Invalid download URL signature.");
    }
    const object = await resolveBucket(context, data).get(path);
    if (!object?.body) {
      throw new HttpError(404, "File not found.");
    }
    return new Response(object.body, {
      headers: buildObjectHeaders(object),
    });
  } catch (error) {
    return jsonError(context, error);
  }
}

async function evaluateStorageRules({
  context,
  options,
  bucket,
  path,
  operation,
}: {
  context: Context;
  options: WorkersOptions;
  bucket: R2BucketLike;
  path: string;
  operation: RulesOperation;
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
    fetchDocument: async () => objectMetadataForRules(await bucket.get(path)),
    server: true,
  });
}

async function resolveRulesOperation(
  bucket: R2BucketLike,
  path: string,
  operation: StorageOperation,
): Promise<RulesOperation> {
  switch (operation) {
    case "get":
    case "downloadUrl":
      return "get";
    case "delete":
      return "delete";
    case "put":
    case "post":
      return await bucket.get(path) ? "update" : "create";
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

function resolveBucket(context: Context, data: StorageWorkerData): R2BucketLike {
  const bindingName = data.bucketBindingName || defaultBucketBindingName;
  const bucket = (context.env as Record<string, unknown> | undefined)?.[bindingName];
  if (!bucket || typeof (bucket as R2BucketLike).get !== "function") {
    throw new HttpError(500, `R2 bucket binding is not found: ${bindingName}`);
  }
  return bucket as R2BucketLike;
}

function resolveDownloadSecret(context: Context, data: StorageWorkerData): string {
  if (data.downloadUrlSecret) {
    return data.downloadUrlSecret;
  }
  const bindingName = data.downloadUrlSecretBindingName || defaultDownloadUrlSecretBindingName;
  const secret = (context.env as Record<string, unknown> | undefined)?.[bindingName];
  if (typeof secret !== "string" || secret.length === 0) {
    throw new HttpError(500, `Download URL secret is not found: ${bindingName}`);
  }
  return secret;
}

async function createLimitedDownloadUrl(
  context: Context,
  path: string,
  expiresIn: number | undefined,
  data: StorageWorkerData,
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + Math.max(1, expiresIn ?? data.defaultExpiresIn ?? defaultExpiresIn);
  const signature = await signDownloadPath(path, expires, resolveDownloadSecret(context, data));
  const baseUrl = data.downloadBaseUrl?.replace(/\/+$/g, "") ?? currentRouteBaseUrl(context);
  return `${baseUrl}/download/${encodeStoragePath(path)}?expires=${expires}&signature=${signature}`;
}

async function signDownloadPath(path: string, expires: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${path}:${expires}`),
  );
  return arrayBufferToHex(signature);
}

function createPublicUrl(path: string, data: StorageWorkerData): string | undefined {
  if (!data.publicBaseUrl) {
    return undefined;
  }
  return `${data.publicBaseUrl.replace(/\/+$/g, "")}/${encodeStoragePath(path)}`;
}

function currentRouteBaseUrl(context: Context): string {
  const url = new URL(context.req.url);
  return `${url.origin}${url.pathname.replace(/\/+$/g, "")}`;
}

function normalizeStoragePath(path: string | undefined): string {
  const normalized = path?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  if (normalized.length === 0 || normalized.includes("..")) {
    throw new HttpError(400, "Storage path is invalid.");
  }
  return normalized;
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function extractDownloadPath(pathname: string): string {
  const marker = "/download/";
  const index = pathname.indexOf(marker);
  if (index < 0) {
    throw new HttpError(400, "Storage path is required.");
  }
  return normalizeStoragePath(decodeURIComponent(pathname.substring(index + marker.length)));
}

function objectMetadataForRules(object: R2ObjectBody | null): Record<string, unknown> | null {
  if (!object) {
    return null;
  }
  return {
    ...object.customMetadata,
    contentType: object.httpMetadata?.contentType,
    size: object.size,
    updated: object.uploaded?.toISOString(),
  };
}

function buildObjectHeaders(object: R2ObjectBody): Headers {
  const headers = new Headers();
  if (object.httpMetadata?.contentType) {
    headers.set("Content-Type", object.httpMetadata.contentType);
  }
  if (object.httpMetadata?.cacheControl) {
    headers.set("Cache-Control", object.httpMetadata.cacheControl);
  }
  if (object.httpMetadata?.contentDisposition) {
    headers.set("Content-Disposition", object.httpMetadata.contentDisposition);
  }
  if (object.httpMetadata?.contentEncoding) {
    headers.set("Content-Encoding", object.httpMetadata.contentEncoding);
  }
  if (object.httpMetadata?.contentLanguage) {
    headers.set("Content-Language", object.httpMetadata.contentLanguage);
  }
  return headers;
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

function arrayBufferToHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

function jsonError(context: Context, error: unknown): Response {
  if (error instanceof HttpError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return context.json({
    error: error instanceof Error ? error.message : String(error),
  }, 500);
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
