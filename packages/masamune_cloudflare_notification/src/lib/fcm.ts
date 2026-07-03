import {
    GoogleServiceAccount,
    HttpError,
    issueGoogleAccessToken,
    utils,
} from "@mathrunet/masamune_cloudflare";

/**
 * FCM message contents.
 *
 * FCMのメッセージ内容。
 */
export interface FcmMessage {
    title: string;
    body: string;
    channelId?: string | undefined | null;
    data?: { [key: string]: any } | undefined;
    badgeCount?: number | undefined | null;
    sound?: string | undefined | null;
}

/**
 * Client for the FCM HTTP v1 API.
 *
 * FCM HTTP v1 APIのクライアント。
 */
export class FcmClient {
    /**
     * Client for the FCM HTTP v1 API.
     *
     * FCM HTTP v1 APIのクライアント。
     *
     * @param config.serviceAccount
     * Service account credentials used to obtain access tokens.
     *
     * アクセストークンの取得に使用するサービスアカウントの認証情報。
     *
     * @param config.projectId
     * Firebase project ID. If not specified, the `project_id` in the service account is used.
     *
     * FirebaseプロジェクトID。指定されていない場合はサービスアカウント内の`project_id`が使用されます。
     */
    constructor({
        serviceAccount,
        projectId,
    }: {
        serviceAccount: GoogleServiceAccount,
        projectId?: string | undefined,
    }) {
        this.serviceAccount = serviceAccount;
        const resolvedProjectId = projectId ?? serviceAccount.project_id;
        if (!resolvedProjectId) {
            throw new HttpError(500, "FCM project ID is not found.");
        }
        this.projectId = resolvedProjectId;
    }

    readonly serviceAccount: GoogleServiceAccount;
    readonly projectId: string;

    /**
     * Send a notification to a single token.
     *
     * 単一のトークンに通知を送信します。
     *
     * @returns { Promise<string> }
     * Message ID (`name` in the response).
     *
     * メッセージID（レスポンスの`name`）。
     */
    async sendToToken(
        token: string,
        message: FcmMessage,
        dryRun = false,
    ): Promise<string> {
        return await this.send({ token: token }, message, dryRun);
    }

    /**
     * Send a notification to multiple tokens.
     *
     * The FCM HTTP v1 API has no multicast endpoint, so tokens are sent individually and results are aggregated. Tokens are split into chunks of 500 (same as the legacy multicast limit).
     *
     * 複数のトークンに通知を送信します。
     *
     * FCM HTTP v1 APIにはマルチキャストのエンドポイントがないため、トークンごとに送信して結果を集約します。トークンは500件（旧マルチキャストの上限と同じ）ごとに分割されます。
     *
     * @returns { Promise<{ [token: string]: string | { error: string } }> }
     * Map of token to message ID or error.
     *
     * トークンからメッセージIDまたはエラーへのマップ。
     */
    async sendToTokens(
        tokens: string[],
        message: FcmMessage,
        dryRun = false,
    ): Promise<{ [token: string]: string | { error: string } }> {
        const results: { [token: string]: string | { error: string } } = {};
        const chunks = utils.splitArray([...new Set(tokens)], 500);
        for (const chunk of chunks) {
            const settled = await Promise.allSettled(
                chunk.map((token) => this.sendToToken(token, message, dryRun)),
            );
            for (let i = 0; i < chunk.length; i++) {
                const result = settled[i];
                if (result.status === "fulfilled") {
                    results[chunk[i]] = result.value;
                } else {
                    results[chunk[i]] = {
                        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                    };
                }
            }
        }
        return results;
    }

    /**
     * Send a notification to a topic.
     *
     * トピックに通知を送信します。
     */
    async sendToTopic(
        topic: string,
        message: FcmMessage,
        dryRun = false,
    ): Promise<string> {
        return await this.send({ topic: topic }, message, dryRun);
    }

    private async send(
        target: { token: string } | { topic: string },
        message: FcmMessage,
        dryRun: boolean,
    ): Promise<string> {
        const accessToken = await issueGoogleAccessToken({
            serviceAccount: this.serviceAccount,
            scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
        });
        const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    validate_only: dryRun ? true : undefined,
                    message: {
                        ...target,
                        notification: {
                            title: message.title,
                            body: message.body,
                        },
                        android: {
                            priority: "HIGH",
                            notification: {
                                title: message.title,
                                body: message.body,
                                click_action: "FLUTTER_NOTIFICATION_CLICK",
                                channel_id: message.channelId ?? undefined,
                                sound: message.sound ?? undefined,
                            },
                        },
                        apns: {
                            payload: {
                                aps: {
                                    sound: message.sound ?? undefined,
                                    badge: message.badgeCount ?? undefined,
                                },
                            },
                        },
                        // FCM HTTP v1では全ての値を文字列にする必要があります。
                        data: stringifyDataValues(message.data),
                    },
                }),
            },
        );
        if (!res.ok) {
            const body = await res.text();
            throw new HttpError(500, `Failed to send FCM message: ${res.status} ${body}`);
        }
        const json = await res.json() as { name?: string };
        return json.name ?? "";
    }
}

/**
 * Convert all values in the data payload to strings, as required by the FCM HTTP v1 API.
 *
 * FCM HTTP v1 APIの要件に従って、データペイロード内のすべての値を文字列に変換します。
 */
export function stringifyDataValues(
    data: { [key: string]: any } | undefined,
): { [key: string]: string } | undefined {
    if (!data) {
        return undefined;
    }
    const result: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value === "string") {
            result[key] = value;
        } else if (typeof value === "object") {
            result[key] = JSON.stringify(value);
        } else {
            result[key] = String(value);
        }
    }
    return result;
}
