import * as f from "../src/index";

describe("Export test", () => {
    test("Test sample", () => {
        f.deploy(
            exports,
            ["us-central1", "asia-northeast1"],
            [],
        )
    });
});