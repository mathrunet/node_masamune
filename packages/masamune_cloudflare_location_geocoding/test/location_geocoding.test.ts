import { deploy, NoneAuthAdapter } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

const geocodingSuccessResponse = {
    status: "OK",
    results: [
        {
            geometry: {
                location: {
                    lat: 35.6594666,
                    lng: 139.7005536,
                },
            },
        },
    ],
};

function createApp() {
    return deploy([
        Functions.geocoding({
            auth: new NoneAuthAdapter(),
            apiKey: "test-api-key",
        }),
    ]);
}

describe("masamune_cloudflare_location_geocoding", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    test("正常系: 住所から緯度経度を取得", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => geocodingSuccessResponse,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = createApp();
        const response = await app.request("http://localhost/geocoding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "東京都渋谷区" }),
        });
        expect(response.status).toBe(200);
        const result = await response.json() as { [key: string]: any };
        expect(result).toHaveProperty("success", true);
        expect(Array.isArray(result.results)).toBe(true);
        const location = result.results[0].geometry?.location;
        expect(typeof location.lat).toBe("number");
        expect(typeof location.lng).toBe("number");
        const requestedUrl = (fetchMock.mock.calls as unknown as [string][])[0][0];
        expect(requestedUrl).toContain("https://maps.googleapis.com/maps/api/geocode/json");
        expect(requestedUrl).toContain(encodeURIComponent("東京都渋谷区"));
        expect(requestedUrl).toContain("key=test-api-key");
    });

    test("正常系: options未指定時はcontext.envのMAP_GEOCODING_APIKEYを使用", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => geocodingSuccessResponse,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.geocoding({ auth: new NoneAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/geocoding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "150-0001" }),
        }, {
            MAP_GEOCODING_APIKEY: "env-api-key",
        });
        expect(response.status).toBe(200);
        const requestedUrl = (fetchMock.mock.calls as unknown as [string][])[0][0];
        expect(requestedUrl).toContain("key=env-api-key");
    });

    test("エラー: address未指定", async () => {
        const app = createApp();
        const response = await app.request("http://localhost/geocoding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Query parameter is invalid." });
    });

    test("エラー: APIキー未設定", async () => {
        const app = deploy([
            Functions.geocoding({ auth: new NoneAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/geocoding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "東京都渋谷区" }),
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "MAP_GEOCODING_APIKEY is not set." });
    });

    test("エラー: Geocoding APIがエラーを返す", async () => {
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
            ok: false,
            status: 403,
        } as unknown as Response)) as unknown as typeof fetch;
        const app = createApp();
        const response = await app.request("http://localhost/geocoding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: "東京都渋谷区" }),
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Failed to request Geocoding API: 403" });
    });
});
