import * as functions from "firebase-functions/v2";
import * as algolia from "algoliasearch";
import { PathFunctionsOptions } from "../lib/functions_base";

/**
 * Synchronize data to Algolia.
 *
 * Algoliaにデータを同期します。
 *
 * @param {string} process.env.ALGOLIA_APPID
 * Specify the Application ID for Algolia.
 * 1. open the Settings page at the bottom left of the Algolia dashboard screen and open "API Keys".
 * 2. Copy "Application ID".
 * Algolia用のApplication IDを指定します。
 * 1. Algoliaのダッシュボードの画面左下のSettingsページを開き「API Keys」を開く。
 * 2. 「Application ID」をコピーする。
 *
 * @param {string} process.env.ALGOLIA_APIKEY
 * Specify the Application ID for Algolia.
 * 1. open the Settings page at the bottom left of the Algolia dashboard screen and open "API Keys".
 * 2. Open the "All API Key" screen and create a new API key from "New API Key".
 *   - Be sure to add "AddObject" and "DeleteObject" to "ACL".
 * Algolia用のApplication IDを指定します。
 * 1. Algoliaのダッシュボードの画面左下のSettingsページを開き「API Keys」を開く。
 * 2. 「All API Key」の画面を開き「New API Key」から新しくAPIキーを作成する。
 *   - 「ACL」に「AddObject」「DeleteObject」を追加しておくこと。
 */
module.exports = (
    regions: string[],
    options: PathFunctionsOptions,
    data: { [key: string]: string }
) => functions.database.onValueWritten(
    {
        ref: options.path ?? "",
        region: regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (event) => {
        try {
            const after = event.data.after;
            const before = event.data.before;
            const indexName = options.path?.split("/").pop() ?? "";
            const client = algolia.default(
                process.env.ALGOLIA_APPID ?? "",
                process.env.ALGOLIA_APIKEY ?? "",
            );
            // create
            if (!before.exists() && after.exists()) {
                const data = after.val();
                const key = after.key;
                if (!key || !data) {
                    return;
                }
                const algoliaObject = {
                    ...data,
                    "@uid": key,
                    objectID: key,
                };
                const index = client.initIndex(indexName);
                await index.saveObject(algoliaObject);
            // update
            } else if (before.exists() && after.exists()) {
                const data = after.val();
                const key = after.key;
                if (!key || !data) {
                    return;
                }
                const algoliaObject = {
                    ...data,
                    "@uid": key,
                    objectID: key,
                };
                const index = client.initIndex(indexName);
                await index.saveObject(algoliaObject);
            // delete
            } else if (before.exists() && !after.exists()) {
                const key = before.key;
                if (!key) {
                    return;
                }
                const index = client.initIndex(indexName);
                await index.deleteObject(key);
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
