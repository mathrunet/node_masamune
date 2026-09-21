import { Context } from "hono";
import { TursoDatabaseConnection, TursoGroup, TursoGroupContext, TursoWorkersOptions } from "./types";
import { HttpError } from "./http_error";

interface TursoWorkersEnv {
  TURSO_ORGANIZATION?: string | undefined;
  TURSO_GROUP?: string | undefined;
  TURSO_GROUPS?: string | readonly TursoGroup[] | undefined;
  TURSO_PLATFORM_API_TOKEN?: string | undefined;
  TURSO_SERVER_TOKEN_TTL_SECONDS?: string | undefined;
}

export function resolveTursoWorkersOptionsFromEnv(
  context: Context,
  options: TursoWorkersOptions,
): TursoWorkersOptions {
  const env = (context.env ?? {}) as TursoWorkersEnv;
  return {
    ...options,
    organization: firstNonEmpty(
      env.TURSO_ORGANIZATION,
      options.organization,
    ),
    group: firstNonEmpty(env.TURSO_GROUP, options.group),
    groups: parseTursoGroups(env.TURSO_GROUPS) ?? options.groups,
    platformApiToken: firstNonEmpty(
      env.TURSO_PLATFORM_API_TOKEN,
      options.platformApiToken,
    ),
    serverTokenTtlSeconds: firstPositiveInteger(
      env.TURSO_SERVER_TOKEN_TTL_SECONDS,
      options.serverTokenTtlSeconds,
    ),
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function firstPositiveInteger(
  envValue: string | undefined,
  optionValue: number | undefined,
): number | undefined {
  if (envValue !== undefined && envValue.trim().length > 0) {
    const parsed = Number(envValue);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number.isSafeInteger(optionValue) && (optionValue ?? 0) > 0
    ? optionValue
    : undefined;
}


/** WranglerのJSON文字列とサーバー側の型付き設定を共通化します。 */
export function parseTursoGroups(value: unknown): readonly TursoGroup[] | undefined {
  if (value === undefined || value === "") return undefined;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new HttpError(500, "TURSO_GROUPS must be a JSON array.");
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new HttpError(500, "groups must be a non-empty array.");
  }
  const names = new Set<string>();
  const countries = new Set<string>();
  const continents = new Set<string>();
  for (const group of parsed) {
    if (!group || typeof group.name !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(group.name) || names.has(group.name)) {
      throw new HttpError(500, "groups must have unique valid names.");
    }
    names.add(group.name);
    for (const [key, seen] of [["countries", countries], ["continents", continents]] as const) {
      const codes = group[key];
      if (codes === undefined) continue;
      if (!Array.isArray(codes) || codes.some((code: unknown) =>
        typeof code !== "string" || !/^[A-Z]{2}$/.test(code) ||
        (key === "continents" && !["AF", "AN", "AS", "EU", "NA", "OC", "SA"].includes(code)))) {
        throw new HttpError(500, `groups.${key} must contain uppercase region codes.`);
      }
      for (const code of codes) {
        if (seen.has(code)) throw new HttpError(500, `Duplicate groups.${key}: ${code}`);
        seen.add(code);
      }
    }
  }
  return parsed as TursoGroup[];
}

/** クライアントの希望はサーバーの許可リスト内に限定します。 */
export function validateTursoGroupRequest(
  options: TursoWorkersOptions,
  context: TursoGroupContext = {},
): void {
  const groups = parseTursoGroups(options.groups);
  if (groups && options.group && !groups.some((item) => item.name === options.group)) {
    throw new HttpError(500, "Default group must be included in groups.");
  }
  if (context.requestedGroup !== undefined) {
    if (typeof context.requestedGroup !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(context.requestedGroup)) {
      throw new HttpError(400, "Invalid group.");
    }
    if (!groups?.some((item) => item.name === context.requestedGroup)) {
      throw new HttpError(403, "Requested group is not allowed.");
    }
  }
}

/** 既存DBは現在地によらず所属先を使い、キャッシュ経由でも許可を確認します。 */
export function validateTursoDatabaseGroup<T extends Pick<TursoDatabaseConnection, "group">>(
  connection: T,
  options: TursoWorkersOptions,
): T {
  if (options.groups && !options.groups.some((item) => item.name === connection.group)) {
    throw new HttpError(403, "Database group is not allowed or could not be verified.");
  }
  return connection;
}

export function tursoGroupContext(context: Context, requestedGroup?: string): TursoGroupContext {
  const cf = (context.req.raw as Request & {
    cf?: { country?: unknown; continent?: unknown };
  }).cf;
  return {
    requestedGroup,
    country: typeof cf?.country === "string" ? cf.country : undefined,
    continent: typeof cf?.continent === "string" ? cf.continent : undefined,
    authentication: context.get("authentication"),
  };
}

/** 新規DBだけを解決します。既定groupは地域不明時のfallbackです。 */
export async function resolveTursoCreationGroup(
  database: string,
  options: TursoWorkersOptions,
  context: TursoGroupContext = {},
): Promise<string> {
  validateTursoGroupRequest(options, context);
  const groups = options.groups ?? [];
  const resolved = await options.resolveGroup?.({
    ...context, database, databasePrefix: options.databasePrefix, groups,
  });
  const selected = resolved ?? context.requestedGroup ??
    groups.find((item) => context.country && item.countries?.includes(context.country))?.name ??
    groups.find((item) => context.continent && item.continents?.includes(context.continent))?.name ??
    firstNonEmpty(options.group,
      options.groups === undefined && typeof process !== "undefined" ? process.env?.TURSO_GROUP : undefined) ??
    groups[0]?.name;
  if (!selected) {
    throw new HttpError(500, "group or TURSO_GROUP is required to create Turso databases.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(selected) ||
      (options.groups && !groups.some((item) => item.name === selected))) {
    throw new HttpError(500, "Resolved group must be included in groups.");
  }
  return selected;
}
