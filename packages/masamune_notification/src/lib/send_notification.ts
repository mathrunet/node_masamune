import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { utils, firestore, ModelToken } from "@mathrunet/masamune";
import "@mathrunet/masamune";
import { SendNotificationRequest, SendNotificationResponse } from "./interface";

/**
 * Define the process for PUSH notification.
 * 
 * PUSH通知を行うための処理を定義します。
 * 
 * @param title
 * The title of the notice should be listed.
 * 
 * 通知タイトルを記載します。
 * 
 * @param body
 * The contents of the notice will be described.
 * 
 * 通知内容を記載します。
 * 
 * @param channel_id
 * Describe ChannelId for Android.
 * 
 * Android向けのChannelIdを記載します。
 * 
 * @param data
 * Specify the data to be placed on the notification.
 * 
 * 通知に乗せるデータを指定します。
 * 
 * @param link
 * Specify the link to be opened when the notification is clicked.
 * 
 * 通知がクリックされたときに開くリンクを指定します。
 * 
 * @param badgeCount
 * Specifies the badge count of the notification.
 * 
 * 通知のバッジカウントを指定します。
 * 
 * @param sound
 * Specifies the sound of the notification.
 * 
 * 通知のサウンドを指定します。
 * 
 * @param targetToken
 * Specifies the FCM token.
 * 
 * FCMトークンを指定します。
 * 
 * @param targetTopic
 * Specifies the topic of the FCM.
 * 
 * FCMのトピックを指定します。
 * 
 * @param targetCollectionPath
 * Specifies the path of the collection to be notified.
 * 
 * 通知対象のコレクションのパスを指定します。
 * 
 * @param targetDocumentPath
 * Specifies the path of the document to be notified.
 * 
 * 通知対象のドキュメントのパスを指定します。
 * 
 * @param targetTokenField
 * Specifies the key of the field used to retrieve the token to be notified.
 * 
 * 通知対象のトークンを取得する際のフィールドのキーを指定します。
 * 
 * @param targetWheres
 * Specify the conditions for retrieving the collections to be notified.
 * 
 * 通知対象のコレクションを取得する際の条件を指定します。
 * 
 * @param targetConditions
 * Specify the conditions under which data is to be notified.
 * 
 * データを通知対象とする条件を指定します。
 * 
 * @param responseTokenList
 * Specifies whether to return the token list for debugging.
 *
 * デバッグ用にトークンリストを返すかどうかを指定します。
 *
 * @param dryRun
 * If true, the message will be validated but not sent.
 *
 * trueの場合、メッセージは検証されますが送信されません。
 */
export async function sendNotification(request: SendNotificationRequest): Promise<SendNotificationResponse> {
    const res: { [key: string]: any } = {};
    try {
        if ((request.targetToken === undefined || request.targetToken === null) && (request.targetTopic === undefined || request.targetTopic === null) && (request.targetCollectionPath === undefined || request.targetCollectionPath === null) && (request.targetDocumentPath === undefined || request.targetDocumentPath === null)) {
            throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic], [targetCollectionPath], [targetDocumentPath] must be specified.");
        }
        // Linkがあればdataに追加
        if (request.link) {
            request.data = {
                ...request.data ?? {},
                "@link": request.link,
            };
        }
        // トークンによる通知
        if (request.targetToken !== undefined && request.targetToken !== null) {
            if (request.showLog) {
                console.log(`Notification target token: ${request.targetToken}`);
            }
            console.log(`targetToken: ${JSON.stringify(request.targetToken)}`);
            if (typeof request.targetToken === "string") {
                request.targetToken = [request.targetToken];
            }
            if (request.targetToken instanceof ModelToken) {
                request.targetToken = request.targetToken.value();
            }
            if (request.targetToken != null && typeof request.targetToken === "object" && "@type" in request.targetToken && request.targetToken["@type"] === "ModelToken") {
                request.targetToken = (request.targetToken as { [key: string]: any })["@list"] as string[] | undefined | null ?? [];
            }
            const tokenList = utils.splitArray([...new Set(request.targetToken)], 500);
            if (request.responseTokenList) {
                const response: SendNotificationResponse = {
                    success: true,
                    results: tokenList,
                };
                return response;
            }
            for (let t in tokenList) {
                try {
                    const messageId = await admin.messaging().sendEachForMulticast(
                        {
                            notification: {
                                title: request.title,
                                body: request.body,
                            },
                            android: {
                                priority: "high",
                                notification: {
                                    title: request.title,
                                    body: request.body,
                                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                    channelId: request.channelId ?? undefined,
                                    sound: request.sound ?? undefined,
                                },
                            },
                            apns: {
                                payload: {
                                    aps: {
                                        sound: request.sound ?? undefined,
                                        badge: request.badgeCount ?? undefined,
                                    },
                                }
                            },
                            data: request.data,
                            tokens: tokenList[t],
                        },
                        request.dryRun ?? false
                    );
                    res[t] = messageId;
                } catch (e) {
                    console.log(e);
                    console.log({
                        notification: {
                            title: request.title,
                            body: request.body,
                        },
                        android: {
                            priority: "high",
                            notification: {
                                title: request.title,
                                body: request.body,
                                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                channelId: request.channelId ?? undefined,
                                sound: request.sound ?? undefined,
                            },
                        },
                        apns: {
                            payload: {
                                aps: {
                                    sound: request.sound ?? undefined,
                                    badge: request.badgeCount ?? undefined,
                                },
                            }
                        },
                        data: request.data,
                        tokens: tokenList[t],
                    });
                }
            }
            const response: SendNotificationResponse = {
                success: true,
                results: res,
            };
            return response;
            // トピックによる通知
        } else if (request.targetTopic !== undefined && request.targetTopic !== null) {
            if (request.showLog) {
                console.log(`Notification target topic: ${request.targetTopic}`);
            }
            if (request.responseTokenList) {
                const response: SendNotificationResponse = {
                    success: true,
                    results: request.targetTopic,
                };
                return response;
            }
            try {
                const messageId = await admin.messaging().send(
                    {
                        notification: {
                            title: request.title,
                            body: request.body,
                        },
                        android: {
                            priority: "high",
                            notification: {
                                title: request.title,
                                body: request.body,
                                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                channelId: request.channelId ?? undefined,
                            },
                        },
                        data: request.data,
                        topic: request.targetTopic,
                    },
                    request.dryRun ?? false
                );
                res[request.targetTopic] = messageId;
            } catch (e) {
                console.log(e);
                console.log({
                    notification: {
                        title: request.title,
                        body: request.body,
                    },
                    android: {
                        priority: "high",
                        notification: {
                            title: request.title,
                            body: request.body,
                            clickAction: "FLUTTER_NOTIFICATION_CLICK",
                            channelId: request.channelId ?? undefined,
                        },
                    },
                    data: request.data,
                    topic: request.targetTopic,
                });
            }
            const response: SendNotificationResponse = {
                success: true,
                results: res,
            };
            return response;
            // コレクションパスによる通知
        } else if (request.targetCollectionPath !== undefined && request.targetCollectionPath !== null && request.targetTokenField != undefined && request.targetTokenField !== null) {
            if (request.showLog) {
                console.log(`Notification target collection path: ${request.targetCollectionPath} wheres: ${JSON.stringify(request.targetWheres)} conditions: ${JSON.stringify(request.targetConditions)}`);
            }
            const collectionRef = firestore.where({
                query: request.firestoreInstance.collection(request.targetCollectionPath),
                wheres: request.targetWheres,
            });
            const results: any[] = [];
            const tokens: string[] = [];
            let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
            let collection: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData> | null = null;
            do {
                collection = await firestore.cursor({ query: collectionRef, limit: 500, cursor: cursor }).load();
                for (let doc of collection.docs) {
                    const docData = doc.data();
                    if (request.showLog) {
                        console.log(`Document: ${JSON.stringify(docData)}`);
                    }
                    if (!await firestore.hasMatch({ data: docData, conditions: request.targetConditions })) {
                        continue;
                    }
                    const token = await firestore.get({ data: docData, field: request.targetTokenField });
                    if (typeof token === "string") {
                        tokens.push(token);
                    } else if (token instanceof ModelToken) {
                        tokens.push(...token.value());
                    } else if (Array.isArray(token)) {
                        tokens.push(...token);
                    }
                }
                const res = await sendNotification({
                    title: request.title,
                    body: request.body,
                    data: request.data,
                    channelId: request.channelId,
                    badgeCount: request.badgeCount,
                    sound: request.sound,
                    responseTokenList: request.responseTokenList,
                    targetToken: tokens,
                    firestoreInstance: request.firestoreInstance,
                    showLog: request.showLog,
                    dryRun: request.dryRun,
                });
                results.push(res.results ?? []);
                if (collection.docs.length < 500) {
                    break;
                }
                cursor = collection.docs[collection.docs.length - 1];
            } while (collection.docs.length >= 500);
            if (request.responseTokenList) {
                const response: SendNotificationResponse = {
                    success: true,
                    results: results,
                };
                return response;
            }
            // ドキュメントパスによる通知
        } else if (request.targetDocumentPath !== undefined && request.targetDocumentPath !== null && request.targetTokenField != undefined && request.targetTokenField !== null) {
            if (request.showLog) {
                console.log(`Notification target document path: ${request.targetDocumentPath} conditions: ${JSON.stringify(request.targetConditions)}`);
            }
            const documentRef = request.firestoreInstance.doc(request.targetDocumentPath);
            const results: any[] = [];
            const doc = await documentRef.load();
            const docData = doc.data();
            if (docData) {
                if (request.showLog) {
                    console.log(`Document: ${JSON.stringify(docData)}`);
                }
                if (await firestore.hasMatch({ data: docData, conditions: request.targetConditions })) {
                    const token = await firestore.get({ data: docData, field: request.targetTokenField });
                    const tokens: string[] = [];
                    if (typeof token === "string") {
                        tokens.push(token);
                    } else if (token instanceof ModelToken) {
                        tokens.push(...token.value());
                    } else if (Array.isArray(token)) {
                        tokens.push(...token);
                    }
                    const res = await sendNotification({
                        title: request.title,
                        body: request.body,
                        data: request.data,
                        channelId: request.channelId,
                        badgeCount: request.badgeCount,
                        sound: request.sound,
                        responseTokenList: request.responseTokenList,
                        targetToken: tokens,
                        firestoreInstance: request.firestoreInstance,
                        showLog: request.showLog,
                        dryRun: request.dryRun,
                    });
                    results.push(res.results ?? []);
                }
            }
            if (request.responseTokenList) {
                const response: SendNotificationResponse = {
                    success: true,
                    results: results,
                };
                return response;
            }
        }
    } catch (err) {
        throw err;
    }
    const response: SendNotificationResponse = {
        success: true,
        results: res,
    };
    return response;
}