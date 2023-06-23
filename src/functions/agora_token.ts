import * as functions from "firebase-functions";
import { RtcTokenBuilder, RtcRole } from "agora-token";

/**
 * Obtain an Agora.io security token.
 * 
 * Agora.ioのセキュリティトークンを取得します。
 * 
 * @param agora.app_id
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
 * @param agora.app_certificate
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
 * User ID. Default is 0.
 * 
 * ユーザーID。デフォルトは0です。
 * 
 * @param role
 * Role. You can specify either "audience" or "broadcaster".
 * 
 * 役割。"audience"か"broadcaster"が指定できます。
 */
module.exports = (regions: string[], topics: { [key: string]: string }) => functions.region(...regions).https.onCall(
    async (query) => {
        try {
            const config = functions.config().agora;
            const appId = config.app_id;
            const appCertificate = config.app_certificate;
            const expirationTimeInSeconds = 3600;
            let role = RtcRole.PUBLISHER;
            if (query.role === "audience") {
                role = RtcRole.SUBSCRIBER;
            }
            const channelName = query.name;
            let uid = 0;
            if (query.uid) {
                uid = query.uid;
            }
            if (!channelName) {
                throw new functions.https.HttpsError("invalid-argument", "Channel is invalid.");
            }
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
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
