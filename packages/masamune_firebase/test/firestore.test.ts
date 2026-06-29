import * as admin from "firebase-admin";
import { ModelCounter, ModelDate, ModelDateRange, ModelFieldValue, ModelGeoValue, ModelImageUri, ModelLocale, ModelLocalizedLocaleVaue, ModelLocalizedValue, ModelRefBase, ModelSearch, ModelTime, ModelTimeRange, ModelTimestamp, ModelTimestampRange, ModelToken, ModelUri, ModelVectorValue, ModelVideoUri } from "@mathrunet/masamune";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

function removeSource(data: { [key: string]: any } | undefined): { [key: string]: any } {
    if (data == undefined) {
        return {};
    }
    const result: { [key: string]: any } = {};
    for (const key in data) {
        const val = data[key];
        const updated: { [key: string]: any } = { ...val };
        if (val instanceof ModelFieldValue) {
            delete updated["@source"];
        }
        if (val instanceof ModelRefBase) {
            delete updated["@doc"];
        }
        result[key] = updated;
    }
    return result;
}

interface TestModel {
    name?: string;
    counter?: ModelCounter;
    timestamp?: ModelTimestamp;
    timestampRange?: ModelTimestampRange;
    time?: ModelTime;
    timeRange?: ModelTimeRange;
    date?: ModelDate;
    dateRange?: ModelDateRange;
    locale?: ModelLocale;
    localized?: ModelLocalizedValue;
    uri?: ModelUri;
    image?: ModelImageUri;
    video?: ModelVideoUri;
    search?: ModelSearch;
    token?: ModelToken;
    geo?: ModelGeoValue;
    vector?: ModelVectorValue;
    ref?: ModelRefBase;
}

describe("Firestore Test", () => {
    beforeAll(() => {
        admin.initializeApp();
    });
    test("Firestore save and load", async () => {
        const testPath = "unit/test/katana/saveLoad";
        const testData = {
            name: "aaa",
            text: "bbb",
            number: 100,
        };
        const firestoreInstance = admin.firestore();
        await firestoreInstance.doc(testPath).save(testData);
        const res = await firestoreInstance.doc(testPath).load();
        const data = res.data();
        console.log(data);
        if (data) {
            delete data["@time"];
            delete data["@uid"];
        }
        expect(data).toStrictEqual(testData);
    });
    test("Firestore model field value", async () => {
        const testPath = "unit/test/katana/modelFieldValue";
        const testData: TestModel = {
            name: "aaa",
            counter: new ModelCounter(0),
            timestamp: new ModelTimestamp(),
            timestampRange: new ModelTimestampRange(new Date(2025, 1, 1), new Date(2025, 10, 2)),
            time: new ModelTime(new Date(2025, 1, 1, 10, 0, 0)),
            timeRange: new ModelTimeRange(new Date(2025, 1, 1, 10, 0, 0), new Date(2025, 1, 1, 11, 0, 0)),
            date: new ModelDate(new Date(2025, 1, 1)),
            dateRange: new ModelDateRange(new Date(2025, 1, 1), new Date(2025, 1, 2)),
            locale: new ModelLocale("ja", "JP"),
            localized: new ModelLocalizedValue([
                new ModelLocalizedLocaleVaue({ language: "ja", country: "JP", value: "こんにちは" }),
                new ModelLocalizedLocaleVaue({ language: "en", country: "US", value: "Hello" }),
            ]),
            uri: new ModelUri("https://mathru.net"),
            image: new ModelImageUri("https://mathru.net"),
            video: new ModelVideoUri("https://mathru.net"),
            search: new ModelSearch(["aaa", "bbb", "ccc"]),
            token: new ModelToken(["aaa", "bbb", "ccc"]),
            geo: new ModelGeoValue(35.68177834908552, 139.75310000426765),
            vector: new ModelVectorValue([1.0, 2.0, 3.0]),
            ref: new ModelRefBase("test/ref"),
        };
        console.log(testData);
        const firestoreInstance = admin.firestore();
        await firestoreInstance.doc(testPath).save(testData);
        const res = await firestoreInstance.doc(testPath).load();
        const data = res.data();
        if (data) {
            delete data["@time"];
            delete data["@uid"];
        }
        console.log(removeSource(data));
        expect(removeSource(data)).toStrictEqual(removeSource(testData));
    });
});
