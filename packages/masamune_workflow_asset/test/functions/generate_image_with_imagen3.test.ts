/**
 * Test suite for GenerateImageWithImagen3 function.
 */

import { GenerateImageWithImagen3 } from "../../src/functions/generate_image_with_imagen3";
import { Imagen3Service } from "../../src/services/imagen3_service";
import { StorageService } from "../../src/services/storage_service";
import { WorkflowContext } from "@mathrunet/masamune_workflow";
import { GeminiImageCommandData } from "../../src/models/image_generation";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Mock the services
jest.mock("../../src/services/imagen3_service");
jest.mock("../../src/services/storage_service");

describe("GenerateImageWithImagen3", () => {
    let functionInstance: GenerateImageWithImagen3;
    let mockImagen3Service: jest.Mocked<Imagen3Service>;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(async () => {
        // Add delay before each test to avoid rate limiting
        await (global as any).delayForRateLimit?.();

        // Reset all mocks
        jest.clearAllMocks();

        // Create mock instances
        mockImagen3Service = {
            generateImage: jest.fn().mockResolvedValue({
                imageBuffer: Buffer.from("fake-image-data"),
                mimeType: "image/png",
                width: 1024,
                height: 1024,
                inputTokens: 0,
                outputTokens: 0,
            }),
        } as unknown as jest.Mocked<Imagen3Service>;

        mockStorageService = {
            uploadFile: jest.fn().mockResolvedValue({
                gsUrl: "gs://test-bucket/test-path.png",
                publicUrl: "https://storage.googleapis.com/test-bucket/test-path.png",
            }),
            downloadFile: jest.fn().mockResolvedValue(
                Buffer.from("fake-reference-image")
            ),
        } as unknown as jest.Mocked<StorageService>;

        // Mock the constructors to return our mocked instances
        (Imagen3Service as jest.MockedClass<typeof Imagen3Service>).mockImplementation(
            () => mockImagen3Service
        );

        (StorageService as jest.MockedClass<typeof StorageService>).mockImplementation(
            () => mockStorageService
        );

        // Mock the static methods
        StorageService.generatePath = jest.fn().mockReturnValue("test-path.png");
        StorageService.getContentType = jest.fn().mockReturnValue("image/png");

        // Create function instance
        functionInstance = new GenerateImageWithImagen3({});
    });

    afterAll(async () => {
        // Add delay after all tests to avoid rate limiting
        await (global as any).delayAfterSuccess?.(30000);
    });

    describe("process", () => {
        it("should generate an image successfully with basic prompt", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A beautiful sunset over a calm ocean",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            // Verify service calls
            expect(mockImagen3Service.generateImage).toHaveBeenCalledWith({
                prompt: "A beautiful sunset over a calm ocean",
                negativePrompt: undefined,
                width: 1024,
                height: 1024,
                seed: undefined,
                numOutputs: 1,
            });

            expect(mockStorageService.uploadFile).toHaveBeenCalled();

            // Verify result structure
            expect(result).toHaveProperty("results");
            expect(result.results!.imageGeneration).toHaveProperty("files");
            expect(result.results!.imageGeneration.files).toHaveLength(1);
            expect(result.results!.imageGeneration.inputTokens).toBe(0); // Imagen 3 doesn't use tokens
            expect(result.results!.imageGeneration.outputTokens).toBe(0);
            expect(result.results!.imageGeneration.cost).toBeGreaterThan(0);

            expect(result).toHaveProperty("assets");
            expect(result.assets!.generatedImage).toHaveProperty("url");
            expect(result.assets!.generatedImage).toHaveProperty("public_url");
        });

        it("should generate an image with negative prompt", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A friendly robot",
                            negative_prompt: "scary, dark, violent",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            expect(mockImagen3Service.generateImage).toHaveBeenCalledWith({
                prompt: "A friendly robot",
                negativePrompt: "scary, dark, violent",
                width: 1024,
                height: 1024,
                seed: undefined,
                numOutputs: 1,
            });

            expect(result.results!.imageGeneration).toBeDefined();
        });

        it("should generate an image with custom dimensions", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A mountain landscape",
                            width: 1920,
                            height: 1080,
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            expect(mockImagen3Service.generateImage).toHaveBeenCalledWith({
                prompt: "A mountain landscape",
                negativePrompt: undefined,
                width: 1920,
                height: 1080,
                seed: undefined,
                numOutputs: 1,
            });

            expect(result.results!.imageGeneration.files[0].width).toBe(1024); // Mock returns 1024
            expect(result.results!.imageGeneration.files[0].height).toBe(1024); // Mock returns 1024
        });

        it("should handle custom output path", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A cat playing piano",
                            output_path: "custom/path/image.png",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
                expect.any(Buffer),
                expect.objectContaining({
                    path: "custom/path/image.png",
                })
            );
        });

        it("should calculate cost correctly", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A space station",
                            num_outputs: 2,
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            // Default price is $0.04 per image, 2 images = $0.08
            expect(result.results!.imageGeneration.cost).toBe(0.08);
            expect(result.usage).toBe(0.08);
        });

        it("should throw error when prompt is missing", async () => {
            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            await expect(functionInstance.process(context)).rejects.toThrow(
                "prompt is required"
            );
        });

        it("should throw error when project ID is missing", async () => {
            // Temporarily remove project ID from env
            const originalProject = process.env.GCLOUD_PROJECT;
            delete process.env.GCLOUD_PROJECT;
            delete process.env.GOOGLE_CLOUD_PROJECT;
            delete process.env.GCP_PROJECT_ID;

            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A test image",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            await expect(functionInstance.process(context)).rejects.toThrow(
                "GCP project ID is required"
            );

            // Restore env
            if (originalProject) {
                process.env.GCLOUD_PROJECT = originalProject;
            }
        });

        it("should handle image type classification", async () => {
            // Set environment variable for this test
            process.env.GCLOUD_PROJECT = "test-project";

            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A product photo",
                            image_type: "product",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            const result = await functionInstance.process(context);

            // Note: imageType is not currently implemented in ImageGenerationResults
            // This test would need to be updated if imageType is added to the results
            expect(result.results!.imageGeneration).toBeDefined();
        });

        it("should warn when input/reference images are provided", async () => {
            // Set environment variable for this test
            process.env.GCLOUD_PROJECT = "test-project";

            const consoleSpy = jest.spyOn(console, "warn");

            const context = {
                action: {
                    command: {
                        data: {
                            command: "generate_image_with_gemini",
                            prompt: "A test image",
                            input_image: "gs://bucket/input.png",
                            reference_image: "gs://bucket/reference.png",
                        } as GeminiImageCommandData,
                    },
                    status: "pending",
                    usage: 0,
                    createdTime: new Date(),
                    updatedTime: new Date(),
                } as any,
                task: {} as any,
            } as WorkflowContext;

            await functionInstance.process(context);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Input images are not supported by Imagen 3")
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Reference images are not supported by Imagen 3")
            );

            consoleSpy.mockRestore();
        });
    });
});