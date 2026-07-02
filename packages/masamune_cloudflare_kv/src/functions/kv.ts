import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  CloudflareKvRequestBody,
  CloudflareKvWorkersOptions,
  RulesOperation,
  RulesOperationKey,
} from "../lib/types";
import { createCloudflareKvRulesEngine } from "../lib/rules";

const defaultBindingName = "MASAMUNE_KV";

module.exports = (
  hono: Hono,
  options: CloudflareKvWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.get("/document/*", async (context) => handleGetDocument(context, options));
  hono.put("/document/*", async (context) => handlePutDocument(context, options));
  hono.delete("/document/*", async (context) => handleDeleteDocument(context, options));
  hono.get("/collection/*", async (context) => handleGetCollection(context, options));
  return hono;
};

async function handleGetDocument(
  context: Context,
  options: CloudflareKvWorkersOptions,
): Promise<Response> {
  try {
    const key = extractKey(context, "document");
    const namespace = resolveNamespace(context, options);
    const allowed = await evaluateRules({
      context,
      options,
      key,
      operation: "read",
      fetchDocument: async () => readDocument(namespace, key),
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }
    return context.json({ data: await readDocument(namespace, key) ?? {} });
  } catch (error) {
    return jsonError(context, error);
  }
}

async function handleGetCollection(
  context: Context,
  options: CloudflareKvWorkersOptions,
): Promise<Response> {
  try {
    const key = extractKey(context, "collection");
    const namespace = resolveNamespace(context, options);
    const allowed = await evaluateRules({
      context,
      options,
      key,
      operation: "read",
      fetchDocument: async () => readDocument(namespace, key),
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }
    return context.json({ data: { "__default__": await readDocument(namespace, key) ?? {} } });
  } catch (error) {
    return jsonError(context, error);
  }
}

async function handlePutDocument(
  context: Context,
  options: CloudflareKvWorkersOptions,
): Promise<Response> {
  try {
    const key = extractKey(context, "document");
    const namespace = resolveNamespace(context, options);
    const existing = await readDocument(namespace, key);
    const operation: RulesOperation = existing ? "update" : "create";
    const allowed = await evaluateRules({
      context,
      options,
      key,
      operation,
      fetchDocument: async () => existing,
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }
    const body = await readBody(context);
    const value = requireDocumentValue(body.value);
    await namespace.put(key, JSON.stringify(value));
    return context.json({ data: value });
  } catch (error) {
    return jsonError(context, error);
  }
}

async function handleDeleteDocument(
  context: Context,
  options: CloudflareKvWorkersOptions,
): Promise<Response> {
  try {
    const key = extractKey(context, "document");
    const namespace = resolveNamespace(context, options);
    const allowed = await evaluateRules({
      context,
      options,
      key,
      operation: "delete",
      fetchDocument: async () => readDocument(namespace, key),
    });
    if (!allowed.allowed) {
      return context.json({ error: "denied", rule: allowed.rulePath }, 403);
    }
    await namespace.delete(key);
    return context.json({ data: {} });
  } catch (error) {
    return jsonError(context, error);
  }
}

async function evaluateRules({
  context,
  options,
  key,
  operation,
  fetchDocument,
}: {
  context: Context;
  options: CloudflareKvWorkersOptions;
  key: string;
  operation: RulesOperationKey;
  fetchDocument: () => Promise<Record<string, unknown> | null>;
}) {
  const engine = createCloudflareKvRulesEngine(options.rules);
  const authentication = context.get("authentication") as AuthenticationContext | undefined;
  return await engine.evaluate({
    path: key,
    operation,
    authentication,
    fetchDocument,
    server: true,
  });
}

function resolveNamespace(
  context: Context,
  options: CloudflareKvWorkersOptions,
): CloudflareKvNamespace {
  const bindingName = options.bindingName || defaultBindingName;
  const namespace = (context.env as Record<string, unknown> | undefined)?.[bindingName];
  if (!namespace || typeof (namespace as CloudflareKvNamespace).get !== "function") {
    throw new HttpError(500, `Cloudflare KV binding is not found: ${bindingName}`);
  }
  return namespace as CloudflareKvNamespace;
}

function extractKey(context: Context, marker: "document" | "collection"): string {
  const path = new URL(context.req.url).pathname;
  const index = path.indexOf(`/${marker}/`);
  if (index < 0) {
    throw new HttpError(400, "KV key is required.");
  }
  const key = decodeURIComponent(path.substring(index + marker.length + 2));
  if (!key || key.endsWith("/")) {
    throw new HttpError(400, "KV key is required.");
  }
  return key;
}

async function readBody(context: Context): Promise<CloudflareKvRequestBody> {
  try {
    return await context.req.json<CloudflareKvRequestBody>();
  } catch (_) {
    throw new HttpError(400, "JSON body is required.");
  }
}

async function readDocument(
  namespace: CloudflareKvNamespace,
  key: string,
): Promise<Record<string, unknown> | null> {
  const text = await namespace.get(key, "text");
  if (text == null || text.length === 0) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_) {
    throw new HttpError(500, `KV value is not valid JSON: ${key}`);
  }
  return requireDocumentValue(value);
}

function requireDocumentValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "value must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function jsonError(context: Context, error: unknown): Response {
  if (error instanceof HttpError) {
    return context.json({ error: error.message }, error.status);
  }
  return context.json({
    error: error instanceof Error ? error.message : String(error),
  }, 500);
}

class HttpError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 500,
    message: string,
  ) {
    super(message);
  }
}

interface CloudflareKvNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
