import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  CloudflareKvRequestBody,
  CloudflareKvWorkersOptions,
  RulesOperation,
  RulesOperationKey,
  KvVectorCoordinatorNamespace,
  KvVectorField,
  CloudflareKvNamespace,
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
  hono.post("/document/*", async (context) => handlePutDocument(context, options));
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
    const nearestText = context.req.query("nearest");
    if (nearestText !== undefined) {
      let nearest: { key: string; value: unknown };
      try { nearest = JSON.parse(nearestText); } catch { throw new HttpError(400, "nearest must be valid JSON."); }
      const limit = Number(context.req.query("limit") ?? 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "limit must be between 1 and 100.");
      const specs = vectorSpecs(options, key);
      if (!specs.some(spec => spec.field === nearest.key)) throw new HttpError(400, "Vector field is not configured.");
      const response = await invokeCoordinator(context, options, { action: "search", prefix: key, nearest, limit: 100, specs, ...coordinatorTarget(context, options) });
      if (!response.ok) return response;
      const body = await response.json() as { data: Record<string, unknown>[] };
      const data: Record<string, Record<string, unknown>> = {};
      for (const candidate of body.data) {
        const candidateKey = String(candidate.__masamune_kv_key ?? "");
        delete candidate.__masamune_kv_key;
        const allowed = await evaluateRules({ context, options, key: candidateKey, operation: "read", fetchDocument: async () => candidate });
        if (!allowed.allowed) continue;
        const id = candidateKey.startsWith(`${key}/`) ? candidateKey.slice(key.length + 1) : candidateKey;
        data[id] = candidate;
        if (Object.keys(data).length >= limit) break;
      }
      return context.json({ data });
    }
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
    const specs = vectorSpecs(options, key);
    for (const spec of specs) if ((!Object.hasOwn(value, spec.field) || unloadedVector(value[spec.field])) && existing && Object.hasOwn(existing, spec.field)) value[spec.field] = existing[spec.field];
    if (specs.length) {
      const response = await invokeCoordinator(context, options, { action: "write", key, value, specs, ...coordinatorTarget(context, options) });
      if (!response.ok) return response;
    } else await namespace.put(key, JSON.stringify(value));
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
    const specs = vectorSpecs(options, key);
    if (specs.length) {
      const response = await invokeCoordinator(context, options, { action: "write", key, value: null, specs, ...coordinatorTarget(context, options) });
      if (!response.ok) return response;
    } else await namespace.delete(key);
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
    target: "database",
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

function vectorSpecs(options: CloudflareKvWorkersOptions, key: string): KvVectorField[] {
  return (options.vectors ?? []).filter(spec => key.startsWith(spec.prefix ?? "") || `${key}/`.startsWith(spec.prefix ?? ""));
}

function coordinatorTarget(context: Context, options: CloudflareKvWorkersOptions) {
  return { kvBinding: options.bindingName || defaultBindingName, namespaceParts: [String(context.env?.FLAVOR ?? "prod"), options.bindingName || defaultBindingName] };
}

async function invokeCoordinator(context: Context, options: CloudflareKvWorkersOptions, command: Record<string, unknown>): Promise<Response> {
  const binding = options.coordinatorBinding ?? "MASAMUNE_KV_VECTOR_COORDINATOR";
  const namespace = context.env?.[binding] as KvVectorCoordinatorNamespace;
  if (!namespace?.idFromName) throw new HttpError(500, `KV vector coordinator binding is not found: ${binding}`);
  const id = namespace.idFromName(JSON.stringify(coordinatorTarget(context, options).namespaceParts));
  return namespace.get(id).fetch(new Request("https://kv-vector.internal", { method: "POST", body: JSON.stringify(command) }));
}

function unloadedVector(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)["@type"] === "ModelVectorValue" && Array.isArray((value as Record<string, unknown>)["@vector"]) && ((value as Record<string, unknown>)["@vector"] as unknown[]).length === 0);
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
