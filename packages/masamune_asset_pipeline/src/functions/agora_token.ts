import * as functions from "firebase-functions/v2";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

/**
 * Obtain an Agora.io security token.
 * 
 * Agora.ioのセキュリティトークンを取得します。
 * 
 * @param process.env.AGORA_APP_ID
 * AppID for Agora.
 * Log in to the following URL and create a project.
 * After the project is created, the AppID can be copied.
 * 
 * Agora用のAppID。
 * 下記URLにログインし、プロジェクトを作成します。
 * プロジェクト作成後、AppIDをコピーすることができます。
 * 
 * https://console.agora.io/projects
 * 
 * @param process.env.AGORA_APP_CERTIFICATE
 * AppCertificate for Agora.
 * You can obtain the certificate after entering the project you created and activating it in Security -> App certificate.
 * 
 * Agora用のAppCertificate。
 * 作成したプロジェクトに入り、Security -> App certificateにて有効化した後取得できます。
 * 
 * https://console.agora.io/projects
 * 
 * @param name
 * Channel name.
 * 
 * チャンネル名。
 * 
 * @param uid
 * User ID. either `acount` or one will be used.
 * 
 * ユーザーID。`acount`とどちらかが利用されます。
 * 
 * @param account
 * Account name. Either `acount` or one of the two will be used.
 * 
 * アカウント名。`acount`とどちらかが利用されます。
 * 
 * @param role
 * Role. You can specify either "audience" or "broadcaster".
 * 
 * 役割。"audience"か"broadcaster"が指定できます。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            const appId = process.env.AGORA_APP_ID ?? "";
            const appCertificate = process.env.AGORA_APP_CERTIFICATE ?? "";
            let role = RtcRole.PUBLISHER;
            if (query.data.role === "audience") {
                role = RtcRole.SUBSCRIBER;
            }
            const channelName = query.data.name;
            const uid = query.data.uid as number | undefined | null;
            const account = query.data.account as string | undefined | null;
            const expirationTimeInSeconds = (query.data.expirationSeconds as number | undefined | null) ?? 3600;
            if (!channelName) {
                throw new functions.https.HttpsError("invalid-argument", "Channel is invalid.");
            }
            if (uid) {
                const token = RtcTokenBuilder.buildTokenWithUid(
                    appId,
                    appCertificate,
                    channelName,
                    uid,
                    role,
                    expirationTimeInSeconds,
                    expirationTimeInSeconds,
                );
                return {
                    channel: channelName,
                    token: token,
                };
            } else if (account) {
                const token = RtcTokenBuilder.buildTokenWithUserAccount(
                    appId,
                    appCertificate,
                    channelName,
                    account,
                    role,
                    expirationTimeInSeconds,
                    expirationTimeInSeconds,
                );
                return {
                    channel: channelName,
                    token: token,
                };
            } else {
                throw new functions.https.HttpsError("invalid-argument", "uid or account is required.");
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
