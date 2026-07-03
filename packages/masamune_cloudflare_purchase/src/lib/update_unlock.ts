import { UpdateUnlockData, UpdateUnlockRequest } from "./interface";

/**
 * Unlock function. Unlock information is stored in the form of an overwrite of the user data.
 *
 * 機能をアンロックします。アンロックの情報はユーザーデータに上書きされる形で保存されます。
 *
 * @param {String} targetDocumentFieldPath
 * The path, including the key, of the field in the document where the unlock information is to be stored.
 *
 * アンロック情報を保存するドキュメント内のフィールドのキーを含めたパス。
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
export async function updateUnlock(request: UpdateUnlockRequest): Promise<void> {
    const update: { [key: string]: any } = {};
    const segments = request.targetDocumentFieldPath.split("/").filter((segment) => segment.length > 0);
    const key = segments[segments.length - 1];
    const parent = segments.slice(0, segments.length - 1).join("/");
    const uid = segments[segments.length - 2];
    const data: UpdateUnlockData = {
        ...update,
        "@time": new Date(),
        "@uid": uid,
        [key]: true,
    };
    await request.database.saveDocument(parent, data, { merge: true });
    await request.database.saveDocument(
        `${parent}/transaction/${request.transactionId}`,
        request.transactionData,
        { merge: true },
    );
}
