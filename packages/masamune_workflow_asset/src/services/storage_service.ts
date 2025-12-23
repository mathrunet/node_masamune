/**
 * Firebase Storage Service for uploading generated images.
 * Firebase Storageへの画像アップロードサービス。
 */
import * as admin from "firebase-admin";
import { StorageUploadOptions, StorageUploadResult } from "../models/image_generation";

/**
 * Service for uploading files to Firebase Storage.
 * Firebase Storageにファイルをアップロードするサービス。
 */
export class StorageService {
    private storage: admin.storage.Storage;
    private defaultBucket: string;

    /**
     * Creates a new StorageService instance.
     * @param bucketName Optional bucket name. If not provided, uses default from environment.
     */
    constructor(bucketName?: string) {
        // Initialize Firebase Admin if not already initialized
        if (!admin.apps.length) {
            admin.initializeApp();
        }
        this.storage = admin.storage();
        this.defaultBucket = bucketName ||
            process.env.STORAGE_BUCKET ||
            `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID}.appspot.com`;
    }

    /**
     * Uploads an image buffer to Firebase Storage.
     * 画像バッファをFirebase Storageにアップロードする。
     *
     * @param buffer Image data to upload
     * @param options Upload options
     * @returns Upload result with gs:// and https:// URLs
     */
    async uploadImage(buffer: Buffer, options: StorageUploadOptions): Promise<StorageUploadResult> {
        const bucketName = options.bucket || this.defaultBucket;
        const bucket = this.storage.bucket(bucketName);
        const file = bucket.file(options.path);

        // Upload the buffer
        await file.save(buffer, {
            contentType: options.contentType,
            metadata: {
                contentType: options.contentType,
                cacheControl: "public, max-age=31536000",
            },
        });

        // Make public if requested
        if (options.makePublic) {
            await file.makePublic();
        }

        // Build URLs
        const gsUrl = `gs://${bucketName}/${options.path}`;
        const publicUrl = options.makePublic
            ? `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(options.path).replace(/%2F/g, "/")}`
            : await this.getSignedUrl(file);

        return {
            gsUrl,
            publicUrl,
        };
    }

    /**
     * Downloads a file from Firebase Storage.
     * Firebase Storageからファイルをダウンロードする。
     *
     * @param gsUrl gs:// URL of the file
     * @returns File buffer
     */
    async downloadFile(gsUrl: string): Promise<Buffer> {
        // Parse gs:// URL
        const match = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid gs:// URL: ${gsUrl}`);
        }

        const bucketName = match[1];
        const filePath = match[2];

        const bucket = this.storage.bucket(bucketName);
        const file = bucket.file(filePath);

        const [buffer] = await file.download();
        return buffer;
    }

    /**
     * Gets a signed URL for private file access.
     * プライベートファイルアクセス用の署名付きURLを取得する。
     *
     * @param file Firebase Storage file reference
     * @param expiresIn Expiration time in milliseconds (default: 7 days)
     * @returns Signed URL
     */
    private async getSignedUrl(
        file: ReturnType<ReturnType<admin.storage.Storage["bucket"]>["file"]>,
        expiresIn: number = 7 * 24 * 60 * 60 * 1000
    ): Promise<string> {
        const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + expiresIn,
        });
        return signedUrl;
    }

    /**
     * Deletes a file from Firebase Storage.
     * Firebase Storageからファイルを削除する。
     *
     * @param gsUrl gs:// URL of the file to delete
     */
    async deleteFile(gsUrl: string): Promise<void> {
        // Parse gs:// URL
        const match = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
        if (!match) {
            throw new Error(`Invalid gs:// URL: ${gsUrl}`);
        }

        const bucketName = match[1];
        const filePath = match[2];

        const bucket = this.storage.bucket(bucketName);
        const file = bucket.file(filePath);

        await file.delete();
    }

    /**
     * Generates a unique file path for storing generated images.
     * 生成画像保存用のユニークなファイルパスを生成する。
     *
     * @param prefix Path prefix (e.g., "generated-images")
     * @param format Image format ("png" or "jpeg")
     * @returns Unique file path
     */
    static generatePath(prefix: string = "generated-images", format: string = "png"): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${prefix}/${timestamp}-${random}.${format}`;
    }

    /**
     * Gets the content type for a given image format.
     * 画像フォーマットに対応するContent-Typeを取得する。
     *
     * @param format Image format ("png" or "jpeg")
     * @returns MIME type
     */
    static getContentType(format: string): string {
        switch (format.toLowerCase()) {
            case "jpeg":
            case "jpg":
                return "image/jpeg";
            case "png":
            default:
                return "image/png";
        }
    }
}
