import * as f from "../src/index";

describe("Export test", () => {
    test("Test sample", () => {
        f.Functions.sendNotification.func(["us-central1", "asia-northeast1"])
        // f.deploy(
        //     exports,
        //     ["us-central1", "asia-northeast1"],
        //     [
        //         f.FunctionsData
        //     ],
        // )
    });
});