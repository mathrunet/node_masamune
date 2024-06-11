import * as functions from "firebase-functions/v2";
import { Api } from "../api";

/**
 * Perform IOS receipt verification.
 * 
 * IOSの受信確認を実行します。
 * 
 * @param {String} receiptData
 * Receipt data for purchases.
 * 
 * 購入の際のレシートデータ。
 * 
 * @param {String} password
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * 
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * 
 * @return {Promise<{ [key: string]: any; }}
 * Receipt information for the item.
 * 
 * アイテムの受領情報。
 */
export async function verifyIOS({
    receiptData,
    password
}: {
    receiptData: string,
    password: string
}) {
    let res = await Api.post("https://buy.itunes.apple.com/verifyReceipt", {
        timeout: 30 * 1000,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data: JSON.stringify({
            "receipt-data": receiptData,
            "password": password,
            "exclude-old-transactions": true,
        }),
    });
    if (!res) {
        throw new functions.https.HttpsError("not-found", "The validation data is empty.");
    }
    let json = (await res.json()) as { [key: string]: any };
    console.log(json);
    let status = json["status"];
    if (status === 21007 || status === 21008) {
        res = await Api.post("https://sandbox.itunes.apple.com/verifyReceipt", {
            timeout: 30 * 1000,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            data: JSON.stringify({
                "receipt-data": receiptData,
                "password": password,
                "exclude-old-transactions": true,
            }),
        });
        if (!res) {
            throw new functions.https.HttpsError("not-found", "The validation data is empty.");
        }
        json = (await res.json()) as { [key: string]: any };
        console.log(json);
        status = json["status"];
        if (status !== 0) {
            throw new functions.https.HttpsError("not-found", "Illegal receipt.");
        }
    } else {
        if (status !== 0) {
            throw new functions.https.HttpsError("not-found", "Illegal receipt.");
        }
    }
    return json;
}
