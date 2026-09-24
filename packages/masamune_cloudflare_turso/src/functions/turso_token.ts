import { Context, Hono } from "hono";
import { AuthenticationContext, TursoWorkersOptions } from "../lib/types";
import { jsonError, parseTokenRequest } from "../lib/request";
import {
  createTursoRulesEngine,
  resolveDatabaseTokenAccess,
} from "../lib/rules";
import {
  cacheDatabaseEndpoint,
  createTursoClient,
  resolveDatabaseConnection,
  resolveDatabaseEndpoint,
  waitForDatabaseReady,
  TursoDatabaseEndpoint,
} from "../lib/turso_client";
import { issueDatabaseToken } from "../lib/token";
import { resolveTursoWorkersOptionsFromEnv, tursoGroupContext, validateTursoGroupRequest } from "../lib/env";
import { resolveWorkerDatabasePrefix } from "../lib/database_prefix";
import { ensureTableSchema, resolveTursoSchema } from "../lib/schema";

const tokenSchemaApplications = new Map<string, Promise<void>>();

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
  let database: string | undefined;
  try {
    const resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    const request = await parseTokenRequest(context);
    database = request.database;
    const databaseOptions = resolveWorkerDatabasePrefix(
      resolvedOptions,
      request.prefix,
      (context.env as { FLAVOR?: unknown } | undefined)?.FLAVOR,
      request.database,
    );
    const groupContext = tursoGroupContext(context, request.group);
    validateTursoGroupRequest(databaseOptions, groupContext);
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
    if (!access.authorization) {
      return context.json({
        readMode: access.readMode,
        writeMode: access.writeMode,
        targets: access.scopes,
        scopes: access.scopes,
      });
    }
    phase = "connect";
    const declaredSchemas = access.scopes
      .filter((scope) => scope.readMode === "direct" || scope.writeMode === "direct")
      .map((scope) => ({
        table: scope.table,
        schema: resolveTursoSchema(
          resolvedOptions.schemaManifest,
          request.database,
          scope.table,
        ),
      }))
      .filter((item) => item.schema !== undefined);
    let endpoint: TursoDatabaseEndpoint;
    if (declaredSchemas.length > 0) {
      phase = "schema";
      const connection = await resolveDatabaseConnection(
        request.database,
        databaseOptions,
        groupContext,
      );
      const schemaClient = createTursoClient(connection);
      try {
        if (connection.created) {
          await waitForDatabaseReady(schemaClient);
        }
        for (const item of declaredSchemas) {
          const schema = item.schema!;
          const cacheKey = `${connection.url}\u0000${item.table}\u0000${schema.version}`;
          let application = tokenSchemaApplications.get(cacheKey);
          if (!application) {
            application = ensureTableSchema({
              client: schemaClient,
              table: item.table,
              value: {},
              autoCreateTable: resolvedOptions.autoCreateTable !== false,
              autoMigrateAddColumns:
                resolvedOptions.autoMigrateAddColumns !== false,
              declaredColumns: schema.columns,
              schemaVersion: schema.version,
            });
            tokenSchemaApplications.set(cacheKey, application);
          }
          try {
            await application;
          } catch (error) {
            tokenSchemaApplications.delete(cacheKey);
            throw error;
          }
        }
      } finally {
        await schemaClient.close();
      }
      endpoint = { url: connection.url, created: connection.created, group: connection.group, primaryRegion: connection.primaryRegion };
      if (connection.created) {
        cacheDatabaseEndpoint(request.database, databaseOptions, endpoint);
      }
    } else {
      endpoint = await resolveDatabaseEndpoint(
        request.database,
        databaseOptions,
        groupContext,
      );
    }
    phase = "issue-token";
    const token = await issueDatabaseToken({
      database: request.database,
      authorization: access.authorization,
      ttlSeconds: request.ttlSeconds,
      options: databaseOptions,
    });
    if (endpoint.created && declaredSchemas.length === 0) {
      phase = "database-ready";
      const client = createTursoClient({
        url: endpoint.url,
        authToken: token.token,
      });
      try {
        await waitForDatabaseReady(client);
      } finally {
        await client.close();
      }
      cacheDatabaseEndpoint(request.database, databaseOptions, endpoint);
    }
    return context.json({
      ...token,
      url: endpoint.url,
      group: endpoint.group,
      primaryRegion: endpoint.primaryRegion,
      readMode: access.readMode,
      writeMode: access.writeMode,
      targets: access.scopes,
      scopes: access.scopes,
    });
  } catch (error) {
    return jsonError(context, error, {
      operation: "token",
      phase,
      method: "POST",
      database,
    });
  }
}
