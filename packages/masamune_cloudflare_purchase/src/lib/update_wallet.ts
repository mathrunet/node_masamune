import { DatabaseIncrement } from "@mathrunet/masamune_cloudflare";
import { UpdateWalletData, UpdateWalletRequest } from "./interface";

/**
 * The amount of money in the in-app wallet is added to the in-app wallet due to in-app purchases. In-app wallet information is stored in a form that overwrites user data.
 *
 * アプリ内課金によるアプリ内ウォレットの金額の加算を行います。アプリ内ウォレットの情報はユーザーデータに上書きされる形で保存されます。
 *
 * @param {String} targetDocumentFieldPath
 * The path, including the key, of the field in the document that stores the in-app wallet information.
 *
 * アプリ内ウォレット情報を保存するドキュメント内のフィールドのキーを含めたパス。
 *
 * @param {number} value
 * Value of the amount to be added.
 *
 * 加算する金額の値。
 *
 * @param {String} transactionId
 * Specify the ID of the log.
 *
 * ログのIDを指定します。
 *
 * @param {[key: string]: any} transactionData
 * Log data to be updated.
 *
 * 更新するログデータ。
 */
export async function updateWallet(request: UpdateWalletRequest): Promise<void> {
    const update: { [key: string]: any } = {};
    const segments = request.targetDocumentFieldPath.split("/").filter((segment) => segment.length > 0);
    const key = segments[segments.length - 1];
    const parent = segments.slice(0, segments.length - 1).join("/");
    const uid = segments[segments.length - 2];
    const data: UpdateWalletData = {
        ...update,
        [key]: new DatabaseIncrement(request.value),
        "@uid": uid,
        "@time": new Date(),
    };
    await request.database.saveDocument(parent, data, { merge: true });
    await request.database.saveDocument(
        `${parent}/transaction/${request.transactionId}`,
        request.transactionData,
        { merge: true },
    );
}
