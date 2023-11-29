import * as functions from "firebase-functions";
import { Api } from "../lib/api";

/**
 * Get latitude and longitude with GeocodingAPI.
 *
 * GeocodingAPIで緯度経度を取得します。
 *
 * @param {string} map.geocoding.api_key
 * API key for GoogleMapGeocodingAPI. Follow the steps below to issue it.
 * https://mathru.notion.site/Google-Map-API-API-e9a65fba9795450fb9a252ab4e631ace?pvs=4
 * GoogleMapGeocodingAPI用のAPIキー。下記の手順で発行します。
 * https://mathru.notion.site/Google-Map-API-API-e9a65fba9795450fb9a252ab4e631ace?pvs=4
 *
 * @param {string} address
 * Address or postal code.
 * アドレスもしくは郵便番号。
 */
module.exports = (regions: string[], timeoutSeconds: number, data: { [key: string]: string }) => functions.runWith({timeoutSeconds: timeoutSeconds}).region(...regions).https.onCall(
    async (query) => {
        try {
            const address = query.address;
            const config = functions.config().map.geocoding;
            const apiKey = config.api_key;
            if (!address) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            const res = await Api.get(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
            );
            const json = (await res.json()) as { [key: string]: any };
            console.log(json);
            return {
                success: true,
                ...json,
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
