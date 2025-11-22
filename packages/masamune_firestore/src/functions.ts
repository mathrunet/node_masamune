import * as katana from "@mathrunet/katana";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * When a document is deleted, the related collections should be deleted together.
   * 
   * ドキュメントが削除された場合関連するコレクションをまとめて削除するようにします。
   */
  deleteDocuments: (options: katana.RelationPathFunctionsOptions = {}) => new katana.FunctionsData({ id: "delete_documents", func: require("./functions/delete_documents"), options: options }),
  /**
   * A function to enable the use of external Firestore Collection Models.
   * 
   * 外部のFirestoreのCollectionModelを利用できるようにするためのFunction。
   */
  collectionModelFirestore: (options: katana.HttpFunctionsOptions = {}) => new katana.FunctionsData({ id: "collection_model_firestore", func: require("./functions/collection_model_firestore"), options: options }),
  /**
   * A function to enable the use of external Firestore Document Models.
   * 
   * 外部のFirestoreのDocumentModelを利用できるようにするためのFunction。
   */
  documentModelFirestore: (options: katana.HttpFunctionsOptions = {}) => new katana.FunctionsData({ id: "document_model_firestore", func: require("./functions/document_model_firestore"), options: options }),
  /**
   * Functions for enabling external Firestore Aggregate methods.
   * 
   * 外部のFirestoreのAggregateメソッドを利用できるようにするFunctions。
   */
  aggregateModelFirestore: (options: katana.HttpFunctionsOptions = {}) => new katana.FunctionsData({ id: "aggregate_model_firestore", func: require("./functions/aggregate_model_firestore"), options: options }),
} as const;
