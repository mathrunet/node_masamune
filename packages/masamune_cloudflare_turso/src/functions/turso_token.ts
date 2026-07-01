import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TursoWorkersOptions,
} from "../lib/types";
import { jsonError, parseTokenRequest } from "../lib/request";
import {
  createTursoRulesEngine,
  filterAllowedScope,
} from "../lib/rules";
import { resolveDatabaseConnection } from "../lib/turso_client";
import { issueScopedToken } from "../lib/token";

module.exports = (
  hono: Hono,
  options: TursoWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.post("/", async (context) => handleToken(context, options));
  return hono;
};

async function handleToken(
  context: Context,
  options: TursoWorkersOptions,
): Promise<Response> {
  try {
    const request = await parseTokenRequest(context);
    await resolveDatabaseConnection(request.database, options);
    const authentication = context.get("authentication") as AuthenticationContext | undefined;
    const engine = createTursoRulesEngine(options.rules);
    const scope = await filterAllowedScope({
      engine,
      database: request.database,
      scope: request.scope,
      authentication,
    });
    if (scope.length === 0) {
      return context.json({
        error: "denied",
      }, 403);
    }
    const token = await issueScopedToken({
      database: request.database,
      scope,
      ttlSeconds: request.ttlSeconds,
      options,
    });
    return context.json(token);
  } catch (error) {
    return jsonError(context, error);
  }
}
