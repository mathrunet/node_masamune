import { Context, Hono } from "hono";
import { AuthenticationContext, TursoWorkersOptions } from "../lib/types";
import { jsonError, parseTokenRequest } from "../lib/request";
import {
  createTursoRulesEngine,
  resolveDatabaseTokenAccess,
} from "../lib/rules";
import {
  cacheDatabaseConnection,
  createTursoClient,
  resolveDatabaseConnection,
  waitForDatabaseReady,
} from "../lib/turso_client";
import { issueDatabaseToken } from "../lib/token";
import { resolveTursoWorkersOptionsFromEnv } from "../lib/env";

module.exports = (
  hono: Hono,
  options: TursoWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.post("/", async (context) => handleToken(context, options));
  hono.post("/database/:database", async (context) => handleToken(context, options));
  hono.post("/:database", async (context) => handleToken(context, options));
  return hono;
};

async function handleToken(
  context: Context,
  options: TursoWorkersOptions,
): Promise<Response> {
  let phase = "parse";
  try {
    const resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    const request = await parseTokenRequest(context);
    phase = "connect";
    const connection = await resolveDatabaseConnection(
      request.database,
      resolvedOptions,
    );
    if (connection.created) {
      phase = "database-ready";
      const client = createTursoClient(connection);
      await waitForDatabaseReady(client);
      cacheDatabaseConnection(request.database, resolvedOptions, connection);
    }
    phase = "rules";
    const authentication = context.get("authentication") as AuthenticationContext | undefined;
    const engine = createTursoRulesEngine(resolvedOptions.rules);
    const access = await resolveDatabaseTokenAccess({
      engine,
      database: request.database,
      operations: request.operations,
      scope: request.targets ?? request.scope,
      authentication,
    });
    if (!access) {
      return context.json(
        {
          error: "denied",
        },
        403,
      );
    }
    phase = "issue-token";
    const token = access.authorization
      ? await issueDatabaseToken({
          database: request.database,
          authorization: access.authorization,
          ttlSeconds: request.ttlSeconds,
          options: resolvedOptions,
        })
      : undefined;
    return context.json({
      ...(token ? { ...token, url: connection.url } : {}),
      readMode: access.readMode,
      writeMode: access.writeMode,
      targets: access.scopes,
      scopes: access.scopes,
    });
  } catch (error) {
    console.error("Turso token request failed", {
      phase,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(context, error);
  }
}
