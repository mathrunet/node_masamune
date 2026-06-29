import { utils } from "@mathrunet/masamune";
import { firestore } from "@mathrunet/masamune_firebase";

describe("Masamune Test", () => {
    test("Has Match", async () => {
        const testData = {
            key1: "aaa",
            key2: 100,
            key3: 1.5,
            key4: true,
            key5: ["a", "b", "c"],
            key6: null,
        };
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "equalTo", key: "key1", value: "aaa" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "equalTo", key: "key1", value: "aab" }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "notEqualTo", key: "key1", value: "aab" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "notEqualTo", key: "key1", value: "aaa" }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key2", value: 101 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key2", value: 100 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key2", value: 99 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key3", value: 1.6 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key3", value: 1.5 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThan", key: "key3", value: 1.4 }] })).toBe(false);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key2", value: 101 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key2", value: 100 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key2", value: 99 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key3", value: 1.6 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key3", value: 1.5 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "lessThanOrEqualTo", key: "key3", value: 1.4 }] })).toBe(false);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key2", value: 101 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key2", value: 100 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key2", value: 99 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key3", value: 1.6 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key3", value: 1.5 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThan", key: "key3", value: 1.4 }] })).toBe(true);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key2", value: 101 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key2", value: 100 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key2", value: 99 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key3", value: 1.6 }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key3", value: 1.5 }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "greaterThanOrEqualTo", key: "key3", value: 1.4 }] })).toBe(true);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContains", key: "key5", value: "a" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContains", key: "key5", value: "c" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContains", key: "key5", value: "d" }] })).toBe(false);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContainsAny", key: "key5", value: ["a", "c"] }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContainsAny", key: "key5", value: ["a", "d"] }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "arrayContainsAny", key: "key5", value: ["e", "d"] }] })).toBe(false);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "whereIn", key: "key1", value: ["aaa", "bbb"] }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "whereIn", key: "key1", value: ["eee", "bbb"] }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "whereNotIn", key: "key1", value: ["aaa", "bbb"] }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "whereNotIn", key: "key1", value: ["eee", "bbb"] }] })).toBe(true);

        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "isNull", key: "key1" }] })).toBe(false);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "isNull", key: "key6" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "isNotNull", key: "key1" }] })).toBe(true);
        expect(await firestore.hasMatch({ data: testData, conditions: [{ type: "isNotNull", key: "key6" }] })).toBe(false);
    });
});
