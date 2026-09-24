import * as admin from "firebase-admin";

const config = require("firebase-functions-test")({ projectId: "media-test" });
const originalFirebaseConfig = process.env.FIREBASE_CONFIG;

beforeAll(() => {
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "media-test", storageBucket: "media-test" });
    if (admin.apps.length === 0) {
        admin.initializeApp({ projectId: "media-test", storageBucket: "media-test" });
    }
});

afterAll(() => {
    config.cleanup();
    if (originalFirebaseConfig === undefined) {
        delete process.env.FIREBASE_CONFIG;
    } else {
        process.env.FIREBASE_CONFIG = originalFirebaseConfig;
    }
});

test.each([
    ["video/segment.ts", "video/mp2t"],
    ["video/playlist.m3u8", "application/vnd.apple.mpegurl"],
    ["video/poster.jpg", "image/jpeg"],
])("HLS ignores an unsupported upload: %s", async (name, contentType) => {
    const createFunction = require("../src/functions/hls");
    const wrapped = config.wrap(createFunction([], {}, {}));

    await expect(wrapped({ data: { bucket: "media-test", name, contentType } }))
        .resolves.toBeUndefined();
});
