import {
  RulesOperationKey,
  TursoTokenScopeInput,
  TursoWorkersOptions,
} from "./types";

export interface IssuedToken {
  token: string;
  expiresAt: number;
}

export async function issueScopedToken({
  database,
  scope,
  ttlSeconds,
  options,
}: {
  database: string;
  scope: TursoTokenScopeInput[];
  ttlSeconds?: number | undefined;
  options: TursoWorkersOptions;
}): Promise<IssuedToken> {
  const now = Math.floor(Date.now() / 1000);
  const maxTtl = options.maxTtlSeconds ?? 3600;
  const ttl = Math.max(1, Math.min(ttlSeconds ?? 600, maxTtl));
  const expiresAt = now + ttl;
  const payload = {
    iss: options.tokenIssuer?.issuer ?? "masamune_cloudflare_turso",
    aud: options.tokenIssuer?.audience ?? "turso",
    iat: now,
    exp: expiresAt,
    database,
    scope,
    permissions: buildTursoPermissions(scope),
  };
  if (options.organizationName && options.platformApiToken) {
    const jwt = await issuePlatformDatabaseToken({
      database,
      ttlSeconds: ttl,
      permissions: payload.permissions,
      options,
    });
    return {
      token: jwt,
      expiresAt,
    };
  }
  const secret = options.tokenIssuer?.secret ?? options.authToken;
  if (!secret) {
    throw new Error("tokenIssuer.secret or authToken is required to issue scoped tokens.");
  }
  return {
    token: await signHs256(payload, secret),
    expiresAt,
  };
}

export function buildTursoPermissions(scope: TursoTokenScopeInput[]): Record<string, string[]> {
  const permissions: Record<string, Set<string>> = {};
  for (const item of scope) {
    const tablePermissions = permissions[item.table] ?? new Set<string>();
    for (const operation of item.operations) {
      for (const permission of operationToPermissions(operation)) {
        tablePermissions.add(permission);
      }
    }
    permissions[item.table] = tablePermissions;
  }
  return Object.fromEntries(Object.entries(permissions).map(([table, values]) => {
    return [table, [...values].sort()];
  }));
}

async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const unsigned = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function operationToPermissions(operation: RulesOperationKey): string[] {
  switch (operation) {
    case "read":
    case "get":
      return ["data_read"];
    case "create":
      return ["data_add"];
    case "update":
      return ["data_update"];
    case "delete":
      return ["data_delete"];
    case "write":
      return ["data_add", "data_update", "data_delete"];
  }
}

async function issuePlatformDatabaseToken({
  database,
  ttlSeconds,
  permissions,
  options,
}: {
  database: string;
  ttlSeconds: number;
  permissions: Record<string, string[]>;
  options: TursoWorkersOptions;
}): Promise<string> {
  const databaseName = `${options.databaseNamePrefix ?? ""}${database}`;
  const organizationName = options.organizationName;
  const platformApiToken = options.platformApiToken;
  if (!organizationName || !platformApiToken) {
    throw new Error("organizationName and platformApiToken are required.");
  }
  const response = await fetch(
    "https://api.turso.tech/v1/organizations/" +
    `${encodeURIComponent(organizationName)}/databases/${encodeURIComponent(databaseName)}` +
    `/auth/tokens?expiration=${ttlSeconds}s&authorization=full-access`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platformApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissions }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to issue Turso token: ${response.status}`);
  }
  const body = await response.json() as { jwt?: string };
  if (!body.jwt) {
    throw new Error("Turso token response did not include jwt.");
  }
  return body.jwt;
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
