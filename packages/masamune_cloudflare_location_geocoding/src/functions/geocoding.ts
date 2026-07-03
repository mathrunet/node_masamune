import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { GeocodingResponse, GeocodingWorkersOptions } from "../lib/interface";

/**
 * Get latitude and longitude with GeocodingAPI.
 *
 * GeocodingAPIで緯度経度を取得します。
 *
 * @param {string} MAP_GEOCODING_APIKEY
 * API key for GoogleMapGeocodingAPI. Specify it in [options.apiKey] or the `MAP_GEOCODING_APIKEY` Workers secret. Follow the steps below to issue it.
 * https://mathru.notion.site/Google-Map-API-API-e9a65fba9795450fb9a252ab4e631ace?pvs=4
 * GoogleMapGeocodingAPI用のAPIキー。[options.apiKey]または`MAP_GEOCODING_APIKEY`のWorkersシークレットで指定します。下記の手順で発行します。
 * https://mathru.notion.site/Google-Map-API-API-e9a65fba9795450fb9a252ab4e631ace?pvs=4
 *
 * @param {string} address
 * Address or postal code.
 * アドレスもしくは郵便番号。
 */
module.exports = (
    hono: Hono,
    options: GeocodingWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            const address = body.address as string | null | undefined;
            const apiKey = resolveConfig(context, options.apiKey, "MAP_GEOCODING_APIKEY");
            if (!address) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            if (!apiKey) {
                throw new HttpError(500, "MAP_GEOCODING_APIKEY is not set.");
            }
            const res = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
            );
            if (!res.ok) {
                throw new HttpError(500, `Failed to request Geocoding API: ${res.status}`);
            }
            const json = (await res.json()) as { [key: string]: any };
            console.log(json);
            const response: GeocodingResponse = {
                success: true,
                ...json,
            };
            return context.json(response);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
