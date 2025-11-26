/**
 * Storage Service
 *
 * Handles file uploads to Firebase Cloud Storage.
 * Supports PDFs, images, and other marketing report assets.
 *
 * @see https://firebase.google.com/docs/storage/admin/start
 */

import { getStorage, getDownloadURL } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { withRetry } from "../utils/error_handler";

/**
 * Configuration for Storage Service.
 */
export interface StorageServiceConfig {
    /** Cloud Storage bucket name */
    bucket: string;
    /** Base path for marketing reports */
    basePath?: string;
}

/**
 * Upload options.
 */
export interface UploadOptions {
    /** Make file publicly accessible */
    public?: boolean;
    /** Custom metadata */
    metadata?: Record<string, string>;
    /** Cache control header */
    cacheControl?: string;
}

/**
 * Marketing report upload options.
 */
export interface MarketingReportUploadOptions {
    reportId: string;
    appId: string;
    pdfBuffer: Buffer;
    coverImageBuffer?: Buffer;
    chartsBuffers?: Record<string, Buffer>;
}

/**
 * Marketing report upload result.
 */
export interface MarketingReportUploadResult {
    pdfUrl: string;
    pdfPath: string;
    coverImageUrl?: string;
    coverImagePath?: string;
    chartUrls?: Record<string, string>;
}

/**
 * Storage Service for Firebase Cloud Storage.
 */
export class StorageService {
    private bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;
    private basePath: string;

    constructor(config: StorageServiceConfig) {
        // Initialize Firebase Admin if not already done
        if (getApps().length === 0) {
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                // Use service account from environment
                const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
                initializeApp({
                    credential: cert(serviceAccount),
                    storageBucket: config.bucket,
                });
            } else {
                // Use default credentials (in Cloud Functions environment)
                initializeApp({
                    storageBucket: config.bucket,
                });
            }
        }

        this.bucket = getStorage().bucket(config.bucket);
        this.basePath = config.basePath || "marketing-reports";
    }

    /**
     * Upload a buffer to Cloud Storage.
     */
    async uploadBuffer(
        buffer: Buffer,
        filePath: string,
        contentType: string,
        options: UploadOptions = {}
    ): Promise<string> {
        return withRetry(async () => {
            const file = this.bucket.file(filePath);

            await file.save(buffer, {
                contentType,
                metadata: {
                    cacheControl: options.cacheControl || "public, max-age=31536000",
                    ...options.metadata,
                },
                public: options.public ?? true,
            });

            if (options.public ?? true) {
                await file.makePublic();
                return `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;
            } else {
                return await getDownloadURL(file);
            }
        });
    }

    /**
     * Upload a PDF file.
     */
    async uploadPDF(buffer: Buffer, filePath: string, options: UploadOptions = {}): Promise<string> {
        return this.uploadBuffer(buffer, filePath, "application/pdf", {
            cacheControl: "public, max-age=86400", // 1 day cache
            ...options,
        });
    }

    /**
     * Upload an image file.
     */
    async uploadImage(
        buffer: Buffer,
        filePath: string,
        contentType: string = "image/png",
        options: UploadOptions = {}
    ): Promise<string> {
        return this.uploadBuffer(buffer, filePath, contentType, {
            cacheControl: "public, max-age=604800", // 7 days cache
            ...options,
        });
    }

    /**
     * Download a file from Cloud Storage.
     */
    async downloadFile(filePath: string): Promise<Buffer> {
        return withRetry(async () => {
            const file = this.bucket.file(filePath);
            const [buffer] = await file.download();
            return buffer;
        });
    }

    /**
     * Delete a file from Cloud Storage.
     */
    async deleteFile(filePath: string): Promise<void> {
        return withRetry(async () => {
            const file = this.bucket.file(filePath);
            await file.delete({ ignoreNotFound: true });
        });
    }

    /**
     * Get a signed URL for temporary access.
     */
    async getSignedUrl(filePath: string, expiresInMinutes: number = 60): Promise<string> {
        return withRetry(async () => {
            const file = this.bucket.file(filePath);
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: Date.now() + expiresInMinutes * 60 * 1000,
            });
            return url;
        });
    }

    /**
     * List files in a directory.
     */
    async listFiles(prefix: string): Promise<string[]> {
        return withRetry(async () => {
            const [files] = await this.bucket.getFiles({ prefix });
            return files.map((file) => file.name);
        });
    }

    /**
     * Check if a file exists.
     */
    async fileExists(filePath: string): Promise<boolean> {
        const file = this.bucket.file(filePath);
        const [exists] = await file.exists();
        return exists;
    }

    /**
     * Upload a complete marketing report package.
     */
    async uploadMarketingReport(options: MarketingReportUploadOptions): Promise<MarketingReportUploadResult> {
        const { reportId, appId, pdfBuffer, coverImageBuffer, chartsBuffers } = options;

        const reportPath = `${this.basePath}/${appId}/${reportId}`;
        const result: MarketingReportUploadResult = {
            pdfUrl: "",
            pdfPath: "",
        };

        // Upload PDF
        const pdfPath = `${reportPath}/report.pdf`;
        result.pdfUrl = await this.uploadPDF(pdfBuffer, pdfPath);
        result.pdfPath = pdfPath;

        // Upload cover image if provided
        if (coverImageBuffer) {
            const coverPath = `${reportPath}/cover.png`;
            result.coverImageUrl = await this.uploadImage(coverImageBuffer, coverPath);
            result.coverImagePath = coverPath;
        }

        // Upload charts if provided
        if (chartsBuffers && Object.keys(chartsBuffers).length > 0) {
            result.chartUrls = {};
            for (const [name, buffer] of Object.entries(chartsBuffers)) {
                const chartPath = `${reportPath}/charts/${name}.png`;
                result.chartUrls[name] = await this.uploadImage(buffer, chartPath);
            }
        }

        return result;
    }

    /**
     * Get the public URL for a file.
     */
    getPublicUrl(filePath: string): string {
        return `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;
    }
}
