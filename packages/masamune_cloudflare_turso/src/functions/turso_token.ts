import { Context, Hono } from "hono";
import { AuthenticationContext, TursoWorkersOptions } from "../lib/types";
import { jsonError, parseTokenRequest } from "../lib/request";
import {
  createTursoRulesEngine,
  resolveDatabaseTokenAccess,
} from "../lib/rules";
import { resolveDatabaseConnection } from "../lib/turso_client";
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
  try {
    const resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    const request = await parseTokenRequest(context);
    const connection = await resolveDatabaseConnection(
      request.database,
      resolvedOptions,
    );
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
    return jsonError(context, error);
  }
}
