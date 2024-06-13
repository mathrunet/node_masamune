import * as functions from "firebase-functions/v2";
import "../lib/exntensions/string.extension"
import * as admin from "firebase-admin";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

/**
 * Endpoints for testing.
 * 
 * テストを行うためのエンドポイントです。
 */
module.exports = (
  regions: string[],
  options: HttpFunctionsOptions,
  data: { [key: string]: any }
) => functions.https.onCall(
  {
    region: options.region ?? regions,
    timeoutSeconds: options.timeoutSeconds,
    memory: options.memory,
    minInstances: options.minInstances,
    concurrency: options.concurrency,
    maxInstances: options.maxInstances,
  },
  async (query) => {
    try {
      const path = query.data.path;
      if (!path) {
        return {};
      }
      const firestoreInstance = admin.firestore();
      const doc = await firestoreInstance.doc(path).get();
      return { ...doc.data() };
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);
