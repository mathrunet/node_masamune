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