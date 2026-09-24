const config = require("firebase-functions-test")({ projectId: "asset-pipeline-test" });

afterAll(() => {
    config.cleanup();
});

test("start asset creation rejects a missing channel theme before writing to Firestore", async () => {
    const createFunction = require("../src/functions/start_asset_creation");
    const wrapped = config.wrap(createFunction([], {}, {}));

    await expect(wrapped({ data: { assets: { image: "asset.png" } } }))
        .rejects.toMatchObject({ code: "invalid-argument" });
});
