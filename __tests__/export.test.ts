import * as f from "../src/index";

describe("Export test", () => {
    test("", () => {
        f.deploy([
            f.Functions.notification,
        ]);
    });
});