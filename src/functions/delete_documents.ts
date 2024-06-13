import * as functions from "firebase-functions/v2";
import { RelationPathFunctionsOptions } from "../lib/src/functions_base";
import * as delete_documents from "../lib/functions/delete_documents";

/**
 * When a document is deleted, the related collections should be deleted together.
 * 
 * ドキュメントが削除された場合関連するコレクションをまとめて削除するようにします。
 */
module.exports = (
    regions: string[],
    options: RelationPathFunctionsOptions,
    data: { [key: string]: any }
) => functions.firestore.onDocumentDeleted(
    {
        document: `${options.path}/{docId}`,
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (event) => {
        try {
            const docPath = event.data?.ref.path;
            if (!docPath) {
                return;
            }
            const relation = options.relation;
            if (!relation) {
                return;
            }
            const collectionPath = relation(docPath);
            if (!collectionPath) {
                return;
            }
            await delete_documents.deleteDocuments({ collectionPath: collectionPath });
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
