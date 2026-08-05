import { Context, Hono } from "hono";
import {
    HttpError,
    issueGoogleAccessToken,
    jsonError,
    parseGoogleServiceAccount,
    resolveConfig,
    WorkersAuthContext,
} from "@mathrunet/masamune_cloudflare";
import { DeleteUserResponse, DeleteUserWorkersOptions } from "../lib/interface";

/**
 * Make sure to delete the FirebaseAuthentication user.
 * 
 * FirebaseAuthenticationのユーザーを削除するようにします。
 * 
 * @param {string} GOOGLE_SERVICE_ACCOUNT
 * Service account JSON. Specify it in [options.serviceAccount] or the `GOOGLE_SERVICE_ACCOUNT` Workers secret.
 *
 * サービスアカウントJSON。[options.serviceAccount]または`GOOGLE_SERVICE_ACCOUNT`のWorkersシークレットで指定します。
 *
 * @param userId
 * The ID of the user to be deleted.
 * 
 * 削除するユーザーのID。
 */
module.exports = (
    hono: Hono,
    options: DeleteUserWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const authentication = context.get("authentication") as WorkersAuthContext | undefined;
            if (!authentication?.uid) {
                throw new HttpError(401, "Unauthenticated");
            }
            const body = await context.req.json().catch(() => ({})) as { [key: string]: any };
            const userId = body.userId as string | undefined;
            if (!userId) {
                throw new HttpError(400, "No user ID specified in `userId`.");
            }
            if (userId !== authentication.uid) {
                throw new HttpError(403, "The authenticated user cannot delete another user.");
            }
            const serviceAccountJson = resolveConfig(context, options.serviceAccount, "GOOGLE_SERVICE_ACCOUNT");
            if (!serviceAccountJson) {
                throw new HttpError(500, "Service account is required");
            }
            const serviceAccount = parseGoogleServiceAccount(serviceAccountJson);
            const projectId = options.projectId ?? serviceAccount.project_id;
            if (!projectId) {
                throw new HttpError(500, "Firebase project ID is required");
            }
            const token = await issueGoogleAccessToken({
                serviceAccount,
                scopes: options.scopes ?? ["https://www.googleapis.com/auth/identitytoolkit"],
            });
            const deleteResponse = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:delete", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    localId: userId,
                    targetProjectId: projectId,
                }),
            });
            if (!deleteResponse.ok) {
                const responseBody = await deleteResponse.text();
                throw new HttpError(deleteResponse.status, `Failed to delete Firebase Authentication user: ${responseBody}`);
            }
            const response: DeleteUserResponse = {
                success: true,
            };
            return context.json(response);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
