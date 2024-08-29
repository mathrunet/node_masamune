import * as functions from "firebase-functions/v2";
import { FunctionsBase, PathFunctionsOptions } from "./functions_base";
import * as admin from "firebase-admin";

/**
 * Base class for defining Function data for Firestore triggers.
 * 
 * Firestoreのトリガー用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class FirestoreTriggeredProcessFunctionBase extends FunctionsBase {
    /**
     * Base class for defining Function data for Firestore triggers.
     * 
     * Firestoreのトリガー用のFunctionのデータを定義するためのベースクラス。
     */
    constructor(options: PathFunctionsOptions = {}) {
        super({ options: options });
    }

    /** 
     * Specifies the path to be processed.
     * 
     * 処理を実行する対象のパスを指定します。
     * 
     * https://firebase.google.com/docs/functions/firestore-events
     */
    abstract path: string;

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     */
    abstract process(event: functions.firestore.FirestoreEvent<functions.firestore.Change<functions.firestore.DocumentSnapshot> | undefined, Record<string, string>>): Promise<void>;

    abstract id: string;
    data: { [key: string]: any } = {};
    build(regions: string[]): Function {
        const options = this.options as PathFunctionsOptions | undefined | null;
        return functions.firestore.onDocumentWritten(
            options?.path ?? this.path,
            async (event) => {
                return this.process(event);
            },
        );
    }
}