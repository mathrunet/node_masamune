import { AppStoreScraperClient } from "../../src/clients/app_store_scraper_client";
import { GooglePlayScraperClient } from "../../src/clients/google_play_scraper_client";

describe("Developer ID extraction", () => {
    it("deduplicates App Store IDs and drops missing IDs", () => {
        const client = new AppStoreScraperClient({ enableWebsiteScraping: false });
        const apps = [
            { developerId: 10 },
            { developerId: 10 },
            { developerId: 20 },
            {},
        ];
        expect(client.extractDeveloperIds(apps as any)).toEqual([10, 20]);
    });

    it("deduplicates Google Play IDs and drops missing IDs", () => {
        const client = new GooglePlayScraperClient();
        const apps = [
            { developerId: "studio-a" },
            { developerId: "studio-a" },
            { developerId: "studio-b" },
            {},
        ];
        expect(client.extractDeveloperIds(apps as any)).toEqual(["studio-a", "studio-b"]);
    });
});
