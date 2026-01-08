/**
 * GeminiImageService Unit Tests
 *
 * Tests the Gemini image generation service directly without Firestore.
 * Uses actual Gemini API to generate images.
 *
 * Required:
 * - Service account with Vertex AI permissions
 * - Environment variables in test/.env
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { GeminiImageService } from "../../src/services/gemini_image_service";
import { StorageService } from "../../src/services/storage_service";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Service account path for authentication
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    ? path.join(__dirname, "..", process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, "../mathru-net-27ae75a92bc7.json");

// Test configuration
const projectId = process.env.GCP_PROJECT_ID || "mathru-net";
const storageBucket = process.env.STORAGE_BUCKET || `${projectId}.appspot.com`;
const region = process.env.GCLOUD_REGION || "us-central1";

// Set GOOGLE_APPLICATION_CREDENTIALS for VertexAI
process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
process.env.GCLOUD_PROJECT = projectId;

// Initialize Firebase Admin with service account credentials
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: projectId,
        storageBucket: storageBucket,
    });
}

// Ensure test/tmp directory exists
const tmpDir = path.join(__dirname, "../tmp");
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

describe("GeminiImageService Unit Tests", () => {
    let geminiService: GeminiImageService;
    let storageService: StorageService;

    beforeAll(() => {
        geminiService = new GeminiImageService({
            projectId,
            region,
        });
        storageService = new StorageService(storageBucket);
    });

    describe("Image Generation", () => {
        it("should generate an image from a text prompt", async () => {
            console.log("\n=== Testing basic text-to-image generation ===");
            console.log(`Project ID: ${projectId}`);
            console.log(`Region: ${region}`);

            const response = await geminiService.generateImage({
                prompt: "A cute cartoon cat wearing a bow tie, simple illustration style",
                width: 512,
                height: 512,
            });

            // Verify response structure
            expect(response.imageBuffer).toBeInstanceOf(Buffer);
            expect(response.imageBuffer.length).toBeGreaterThan(0);
            expect(response.mimeType).toMatch(/^image\/(png|jpeg)$/);
            expect(response.width).toBeGreaterThan(0);
            expect(response.height).toBeGreaterThan(0);
            expect(response.inputTokens).toBeGreaterThanOrEqual(0);
            expect(response.outputTokens).toBeGreaterThanOrEqual(0);

            console.log("\n=== Generation Results ===");
            console.log(`Image size: ${response.imageBuffer.length} bytes`);
            console.log(`MIME type: ${response.mimeType}`);
            console.log(`Dimensions: ${response.width}x${response.height}`);
            console.log(`Input tokens: ${response.inputTokens}`);
            console.log(`Output tokens: ${response.outputTokens}`);

            // Save locally for verification
            const localPath = path.join(tmpDir, `cat-${Date.now()}.png`);
            fs.writeFileSync(localPath, response.imageBuffer);
            console.log(`\nSaved locally: ${localPath}`);

            // Calculate cost
            const cost = GeminiImageService.calculateCost(
                response.inputTokens,
                response.outputTokens
            );
            console.log(`Estimated cost: $${cost.toFixed(6)}`);

        }, 120000); // 2 minutes timeout

        it("should generate an image with negative prompt", async () => {
            console.log("\n=== Testing image generation with negative prompt ===");

            const response = await geminiService.generateImage({
                prompt: "A beautiful garden with flowers, watercolor style",
                negativePrompt: "dark, scary, dead flowers, wilted",
                width: 512,
                height: 512,
            });

            expect(response.imageBuffer).toBeInstanceOf(Buffer);
            expect(response.imageBuffer.length).toBeGreaterThan(0);

            // Save locally
            const localPath = path.join(tmpDir, `garden-${Date.now()}.png`);
            fs.writeFileSync(localPath, response.imageBuffer);
            console.log(`\nSaved locally: ${localPath}`);

        }, 120000);
    });

    describe("Storage Upload", () => {
        it("should upload an image to Firebase Storage", async () => {
            console.log("\n=== Testing image upload to Storage ===");
            console.log(`Storage bucket: ${storageBucket}`);

            // Create a minimal valid PNG buffer (1x1 red pixel)
            // This avoids rate limiting issues with Gemini API
            const testPngBuffer = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 size
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
                0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
                0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
                0x01, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4,
                0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
                0xAE, 0x42, 0x60, 0x82
            ]);

            // Upload to Storage
            const outputPath = StorageService.generatePath("test-uploads", "png");
            const contentType = StorageService.getContentType("png");

            const uploadResult = await storageService.uploadFile(testPngBuffer, {
                bucket: storageBucket,
                path: outputPath,
                contentType,
                makePublic: true,
            });

            // Verify upload result
            expect(uploadResult.gsUrl).toMatch(/^gs:\/\//);
            expect(uploadResult.gsUrl).toContain(outputPath);
            expect(uploadResult.publicUrl).toMatch(/^https:\/\//);

            console.log("\n=== Upload Results ===");
            console.log(`GS URL: ${uploadResult.gsUrl}`);
            console.log(`Public URL: ${uploadResult.publicUrl}`);

            // Cleanup: delete uploaded file
            try {
                await storageService.deleteFile(uploadResult.gsUrl);
                console.log("\nTest file cleaned up successfully");
            } catch (e) {
                console.warn("Failed to cleanup test file:", e);
            }

        }, 60000);
    });

    describe("Cost Calculation", () => {
        it("should calculate cost correctly", () => {
            const cost = GeminiImageService.calculateCost(
                1000,  // input tokens
                2000,  // output tokens
                0.0000003,  // input price per token
                0.0000025   // output price per token
            );

            // Expected: (1000 * 0.0000003) + (2000 * 0.0000025) = 0.0003 + 0.005 = 0.0053
            expect(cost).toBeCloseTo(0.0053, 6);
        });

        it("should use default prices when not specified", () => {
            const cost = GeminiImageService.calculateCost(1000, 2000);
            expect(cost).toBeGreaterThan(0);
        });
    });

    describe("Path Generation", () => {
        it("should generate unique paths", () => {
            const path1 = StorageService.generatePath("test", "png");
            const path2 = StorageService.generatePath("test", "png");

            expect(path1).not.toBe(path2);
            expect(path1).toMatch(/^test\/\d+-[a-z0-9]+\.png$/);
        });

        it("should support different formats", () => {
            const pngPath = StorageService.generatePath("images", "png");
            const jpegPath = StorageService.generatePath("images", "jpeg");

            expect(pngPath).toMatch(/\.png$/);
            expect(jpegPath).toMatch(/\.jpeg$/);
        });
    });

    describe("Content Type Detection", () => {
        it("should return correct content types", () => {
            expect(StorageService.getContentType("png")).toBe("image/png");
            expect(StorageService.getContentType("jpeg")).toBe("image/jpeg");
            expect(StorageService.getContentType("jpg")).toBe("image/jpeg");
            expect(StorageService.getContentType("unknown")).toBe("image/png"); // default
        });
    });
});
