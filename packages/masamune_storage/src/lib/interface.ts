
/**
 * Response for storage_firebase function.
 * 
 * storage_firebase関数のレスポンス。
 */
export interface StorageFirebaseResponse {
    status: number;
    binary?: string;
    message?: string;
    meta?: {
        contentType?: string;
        size?: number | string;
        updated?: string;
        created?: string;
        downloadUri?: string;
        publicUri?: string;
        [key: string]: any;
    };
}

/**
 * Options for storage_firebase function.
 * 
 * storage_firebase関数のオプション。
 */
export interface StorageFirebaseOptions {
    contentType?: string;
    metadata?: { [key: string]: any };
}