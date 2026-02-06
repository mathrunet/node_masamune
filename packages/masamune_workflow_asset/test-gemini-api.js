/**
 * Simple test script to verify Gemini API image generation
 */
require('dotenv').config({ path: './test/.env' });
const { GoogleGenAI } = require('@google/genai');

async function testGeminiImageGeneration() {
    console.log('Testing Gemini Image Generation API...\n');

    const projectId = process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCP_PROJECT_ID;

    if (!projectId) {
        console.error('No GCP project ID found in environment');
        return;
    }

    console.log('Project ID:', projectId);
    console.log('Region: us-central1');
    console.log('Model: gemini-3-pro-image-preview\n');

    try {
        const genai = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: 'us-central1',
        });

        const prompt = "A beautiful sunset over a calm ocean with orange and purple clouds, digital art style";

        console.log('Sending prompt:', prompt);
        console.log('\n--- Making API Call ---\n');

        const response = await genai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
        });

        console.log('\n--- Full Response Object ---');
        console.log(JSON.stringify(response, null, 2));

        if (response.candidates && response.candidates[0]) {
            const parts = response.candidates[0].content?.parts;
            console.log('\n--- Response Parts ---');
            console.log(JSON.stringify(parts, null, 2));

            if (parts && parts.length > 0) {
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    console.log(`\n--- Part ${i + 1} ---`);

                    if (part.text) {
                        console.log('Text part found:', part.text.substring(0, 200));
                    }

                    if (part.inlineData) {
                        console.log('Image part found!');
                        console.log('MIME Type:', part.inlineData.mimeType);
                        console.log('Data length:', part.inlineData.data ? part.inlineData.data.length : 0);

                        if (part.inlineData.data) {
                            // Save image to file for verification
                            const fs = require('fs');
                            const buffer = Buffer.from(part.inlineData.data, 'base64');
                            const filename = `test-output-${Date.now()}.png`;
                            fs.writeFileSync(filename, buffer);
                            console.log('Image saved to:', filename);
                            console.log('Image size:', buffer.length, 'bytes');
                        }
                    }
                }
            } else {
                console.log('\n❌ No parts in response');
            }
        } else {
            console.log('\n❌ No candidates in response');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response data:', JSON.stringify(error.response, null, 2));
        }
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
    }
}

// Run the test
testGeminiImageGeneration();