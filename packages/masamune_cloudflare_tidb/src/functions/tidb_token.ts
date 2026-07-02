import { Context, Hono } from "hono";
import { AuthenticationContext, TidbWorkersOptions } from "../lib/types";
import { jsonError, parseTokenRequest } from "../lib/request";
import {
  createTidbRulesEngine,
  resolveDatabaseTokenAccess,
} from "../lib/rules";
import {
  resolveDefaultDatabase,
  resolveDatabaseConnection,
} from "../lib/tidb_client";
import { issueDatabaseToken } from "../lib/token";
import { resolveTidbWorkersOptionsFromEnv } from "../lib/env";

module.exports = (
  hono: Hono,
  options: TidbWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.post("/", async (context) => handleToken(context, options));
  hono.post("/database/:database", async (context) => handleToken(context, options));
  hono.post("/:database", async (context) => handleToken(context, options));
  return hono;
};

async function handleToken(
  context: Context,
  options: TidbWorkersOptions,
): Promise<Response> {
  try {
    const resolvedOptions = resolveTidbWorkersOptionsFromEnv(context, options);
    const request = await parseTokenRequest(
      context,
      resolveDefaultDatabase(resolvedOptions),
    );
    const connection = await resolveDatabaseConnection(
      request.database,
      resolvedOptions,
    );
    const authentication = context.get("authentication") as AuthenticationContext | undefined;
    const engine = createTidbRulesEngine(resolvedOptions.rules);
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
    const token = access.authorization
      ? await issueDatabaseToken({
          database: request.database,
          authorization: access.authorization,
          ttlSeconds: request.ttlSeconds,
          options: resolvedOptions,
          readMode: access.readMode,
          writeMode: access.writeMode,
        })
      : undefined;
    return context.json({
      ...(token
        ? {
            ...token,
            host: connection.host,
            port: connection.port,
            database: connection.database,
          }
        : {}),
      readMode: access.readMode,
      writeMode: access.writeMode,
      targets: access.scopes,
      scopes: access.scopes,
    });
  } catch (error) {
    return jsonError(context, error);
  }
}
