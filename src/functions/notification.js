"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
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
 * @param token
 * Specifies the FCM token.
 *
 * FCMトークンを指定します。
 *
 * @param topic
 * Specifies the topic of the FCM.
 *
 * FCMのトピックを指定します。
 */
module.exports = functions.region("asia-northeast1").https.onCall((query) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const title = query.title;
        const body = query.body;
        const channelId = query.channel_id;
        const data = query.data;
        const token = query.token;
        const topic = query.topic;
        if (token === undefined || topic === undefined) {
            throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic] must be specified.");
        }
        const res = yield admin.messaging().send({
            notification: {
                title: title,
                body: body,
            },
            android: {
                priority: "high",
                notification: {
                    title: title,
                    body: body,
                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                    channelId: channelId,
                },
            },
            data: data,
            token: token,
            topic: topic,
        });
        return {
            success: true,
            message_id: res,
        };
    }
    catch (err) {
        console.log(err);
        throw err;
    }
}));
