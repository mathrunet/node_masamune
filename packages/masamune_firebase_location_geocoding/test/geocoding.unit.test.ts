import { Api } from "@mathrunet/masamune_firebase";

jest.mock("@mathrunet/masamune_firebase", () => ({
    Api: { get: jest.fn() },
}));

const config = require("firebase-functions-test")({ projectId: "offline-test" });
const wrapped = config.wrap(require("../src/functions/geocoding")([], {}, {}));
const get = Api.get as jest.Mock;

describe("geocoding without network access", () => {
    const originalApiKey = process.env.MAP_GEOCODING_APIKEY;

    beforeAll(() => {
        process.env.MAP_GEOCODING_APIKEY = "offline-key";
    });

    afterEach(() => {
        get.mockReset();
    });

    afterAll(() => {
        if (originalApiKey === undefined) delete process.env.MAP_GEOCODING_APIKEY;
        else process.env.MAP_GEOCODING_APIKEY = originalApiKey;
        config.cleanup();
    });

    test("encodes the address and returns the geocoding result", async () => {
        const results = [{ geometry: { location: { lat: 35.66, lng: 139.70 } } }];
        get.mockResolvedValue({ json: async () => ({ status: "OK", results }) });

        const response = await wrapped({ data: { address: "東京都渋谷区" } });

        expect(get).toHaveBeenCalledWith(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent("東京都渋谷区")}&key=offline-key`
        );
        expect(response).toEqual({ success: true, status: "OK", results });
    });

    test("propagates a geocoding transport failure", async () => {
        get.mockRejectedValue(new Error("Network unavailable"));
        await expect(wrapped({ data: { address: "Shibuya" } })).rejects.toThrow("Network unavailable");
    });

    test("rejects a missing address before making an API call", async () => {
        await expect(wrapped({ data: {} })).rejects.toThrow("Query parameter is invalid");
        expect(get).not.toHaveBeenCalled();
    });
});
