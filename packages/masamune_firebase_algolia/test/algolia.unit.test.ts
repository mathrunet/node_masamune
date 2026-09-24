import { algoliasearch } from "algoliasearch";

jest.mock("algoliasearch", () => ({ algoliasearch: jest.fn() }));
jest.mock("@mathrunet/masamune_firebase", () => ({
    firestoreLoader: jest.fn(() => ({})),
    FirestoreModelFieldValueConverterUtils: {
        convertFrom: jest.fn(({ data }) => data),
    },
    ModelFieldValueConverterUtils: {
        convertFrom: jest.fn(({ data }) => data),
    },
}));

const config = require("firebase-functions-test")({ projectId: "offline-test" });
const addOrUpdateObject = jest.fn().mockResolvedValue({});
const deleteObject = jest.fn().mockResolvedValue({});

describe("Algolia synchronization without network access", () => {
    const originalAppId = process.env.ALGOLIA_APPID;
    const originalApiKey = process.env.ALGOLIA_APIKEY;
    const path = "unit/test/test_algolia";
    const wrapped = config.wrap(require("../src/functions/algolia")([], { path }, {}));

    beforeAll(() => {
        process.env.ALGOLIA_APPID = "offline-app";
        process.env.ALGOLIA_APIKEY = "offline-key";
        (algoliasearch as jest.Mock).mockReturnValue({ addOrUpdateObject, deleteObject });
    });

    afterEach(() => {
        addOrUpdateObject.mockClear();
        deleteObject.mockClear();
    });

    afterAll(() => {
        if (originalAppId === undefined) delete process.env.ALGOLIA_APPID;
        else process.env.ALGOLIA_APPID = originalAppId;
        if (originalApiKey === undefined) delete process.env.ALGOLIA_APIKEY;
        else process.env.ALGOLIA_APIKEY = originalApiKey;
        config.cleanup();
    });

    test("creates an Algolia object with its Firestore ID", async () => {
        await wrapped({
            data: {
                before: config.firestore.makeDocumentSnapshot(null, `${path}/doc-1`),
                after: config.firestore.makeDocumentSnapshot({ name: "Created" }, `${path}/doc-1`),
            },
            params: { docId: "doc-1" },
        });

        expect(addOrUpdateObject).toHaveBeenCalledWith({
            indexName: "test_algolia",
            objectID: "doc-1",
            body: { name: "Created", "@uid": "doc-1", objectID: "doc-1" },
        });
    });

    test("deletes an Algolia object when a document is removed", async () => {
        await wrapped({
            data: {
                before: config.firestore.makeDocumentSnapshot({ name: "Deleted" }, `${path}/doc-2`),
                after: config.firestore.makeDocumentSnapshot(null, `${path}/doc-2`),
            },
            params: { docId: "doc-2" },
        });

        expect(deleteObject).toHaveBeenCalledWith({ indexName: "test_algolia", objectID: "doc-2" });
    });
});
