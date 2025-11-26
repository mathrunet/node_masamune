/**
 * Storage Service Tests
 *
 * TDD: Write tests first, then implement the service.
 * Uses Firebase Cloud Storage for file uploads.
 *
 * Required environment variables in test/.env:
 * - STORAGE_BUCKET: Cloud Storage bucket name
 * - STORAGE_SERVICE_ACCOUNT_PATH: Path to service account with Storage permissions
 *   (or GOOGLE_SERVICE_ACCOUNT_PATH as fallback)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { StorageService } from "../../src/services/storage_service";

describe("StorageService", () => {
    let service: StorageService;
    const bucket = process.env.STORAGE_BUCKET || "";
    // Use dedicated storage service account, or fall back to general one
    const serviceAccountPath =
        process.env.STORAGE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "";
    const tmpDir = path.join(__dirname, "../tmp");

    beforeAll(() => {
        if (!bucket || !serviceAccountPath) {
            console.warn("Skipping Storage tests: Missing environment variables");
            console.warn("Required: STORAGE_BUCKET and (STORAGE_SERVICE_ACCOUNT_PATH or GOOGLE_SERVICE_ACCOUNT_PATH)");
            return;
        }

        const projectRoot = path.join(__dirname, "..", "..");
        const absoluteServiceAccountPath = path.join(projectRoot, serviceAccountPath);

        if (fs.existsSync(absoluteServiceAccountPath)) {
            process.env.GOOGLE_APPLICATION_CREDENTIALS = absoluteServiceAccountPath;
        } else {
            console.warn(`Service account file not found: ${absoluteServiceAccountPath}`);
            return;
        }

        service = new StorageService({
            bucket: bucket,
        });
    });

    describe("initialization", () => {
        it("should create service with valid config", () => {
            if (!bucket) {
                return;
            }
            expect(service).toBeDefined();
        });
    });

    describe("uploadBuffer", () => {
        it("should upload a buffer to Cloud Storage", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            const testContent = Buffer.from("Test content for upload " + Date.now());
            const testPath = `test/uploads/test-file-${Date.now()}.txt`;

            const url = await service.uploadBuffer(testContent, testPath, "text/plain");

            expect(url).toBeDefined();
            expect(typeof url).toBe("string");
            expect(url).toContain(bucket);
            console.log(`Uploaded to: ${url}`);

            // Clean up
            await service.deleteFile(testPath);
        }, 30000);
    });

    describe("uploadPDF", () => {
        it("should upload a PDF to Cloud Storage", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            // Read the test PDF if it exists
            const pdfPath = path.join(tmpDir, "simple_report.pdf");
            if (!fs.existsSync(pdfPath)) {
                console.warn("Skipping: No test PDF found at", pdfPath);
                return;
            }

            const pdfBuffer = fs.readFileSync(pdfPath);
            const storagePath = `test/reports/test-report-${Date.now()}.pdf`;

            const url = await service.uploadPDF(pdfBuffer, storagePath);

            expect(url).toBeDefined();
            expect(typeof url).toBe("string");
            expect(url).toContain(".pdf");
            console.log(`PDF uploaded to: ${url}`);

            // Download and verify
            const downloadedBuffer = await service.downloadFile(storagePath);
            expect(downloadedBuffer.length).toBe(pdfBuffer.length);

            // Save downloaded file for verification
            const downloadPath = path.join(tmpDir, "downloaded_report.pdf");
            fs.writeFileSync(downloadPath, downloadedBuffer);
            console.log(`Downloaded PDF saved to: ${downloadPath}`);

            // Clean up
            await service.deleteFile(storagePath);
        }, 60000);
    });

    describe("uploadImage", () => {
        it("should upload an image to Cloud Storage", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            // Read a test chart image if it exists
            const imagePath = path.join(tmpDir, "downloads_chart.png");
            if (!fs.existsSync(imagePath)) {
                console.warn("Skipping: No test image found at", imagePath);
                return;
            }

            const imageBuffer = fs.readFileSync(imagePath);
            const storagePath = `test/images/test-chart-${Date.now()}.png`;

            const url = await service.uploadImage(imageBuffer, storagePath, "image/png");

            expect(url).toBeDefined();
            expect(typeof url).toBe("string");
            expect(url).toContain(".png");
            console.log(`Image uploaded to: ${url}`);

            // Clean up
            await service.deleteFile(storagePath);
        }, 30000);
    });

    describe("getSignedUrl", () => {
        it("should generate a signed URL for private access", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            const testContent = Buffer.from("Private content " + Date.now());
            const testPath = `test/private/private-file-${Date.now()}.txt`;

            // Upload first
            await service.uploadBuffer(testContent, testPath, "text/plain", { public: false });

            // Get signed URL
            const signedUrl = await service.getSignedUrl(testPath, 60); // 60 minutes

            expect(signedUrl).toBeDefined();
            expect(typeof signedUrl).toBe("string");
            expect(signedUrl).toContain("Signature");
            console.log(`Signed URL: ${signedUrl}`);

            // Clean up
            await service.deleteFile(testPath);
        }, 30000);
    });

    describe("listFiles", () => {
        it("should list files in a directory", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            // Upload some test files
            const prefix = `test/list-test-${Date.now()}`;
            await Promise.all([
                service.uploadBuffer(Buffer.from("file1"), `${prefix}/file1.txt`, "text/plain"),
                service.uploadBuffer(Buffer.from("file2"), `${prefix}/file2.txt`, "text/plain"),
            ]);

            // List files
            const files = await service.listFiles(prefix);

            expect(files).toBeDefined();
            expect(Array.isArray(files)).toBe(true);
            expect(files.length).toBeGreaterThanOrEqual(2);
            console.log(`Found ${files.length} files`);

            // Clean up
            await Promise.all(files.map((f) => service.deleteFile(f)));
        }, 30000);
    });

    describe("uploadMarketingReport", () => {
        it("should upload a complete marketing report package", async () => {
            if (!bucket || !serviceAccountPath) {
                return;
            }

            const reportId = `test-report-${Date.now()}`;
            const appId = "com.test.app";

            // Read test files if they exist
            const pdfPath = path.join(tmpDir, "marketing_report.pdf");
            const coverPath = path.join(tmpDir, "all_engagement.png");

            if (!fs.existsSync(pdfPath)) {
                console.warn("Skipping: No test PDF found");
                return;
            }

            const pdfBuffer = fs.readFileSync(pdfPath);
            const coverBuffer = fs.existsSync(coverPath) ? fs.readFileSync(coverPath) : undefined;

            const result = await service.uploadMarketingReport({
                reportId,
                appId,
                pdfBuffer,
                coverImageBuffer: coverBuffer,
            });

            expect(result).toBeDefined();
            expect(result.pdfUrl).toBeDefined();
            expect(result.pdfUrl).toContain(reportId);
            console.log(`Report uploaded:`);
            console.log(`  PDF: ${result.pdfUrl}`);
            if (result.coverImageUrl) {
                console.log(`  Cover: ${result.coverImageUrl}`);
            }

            // Clean up
            await service.deleteFile(result.pdfPath);
            if (result.coverImagePath) {
                await service.deleteFile(result.coverImagePath);
            }
        }, 60000);
    });
});
