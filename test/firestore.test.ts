import * as admin from "firebase-admin";
import { splitArray, uuid } from "../src";
import { user } from "firebase-functions/v1/auth";

const config = require("firebase-functions-test")({
  storageBucket: "development-for-mathrunet.appspot.com",
  projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("Firestore Test", () => {
    beforeAll(() => {
        admin.initializeApp();
    });
    test("Test for test", async () => {
        const testPath = "unit/test/user/aaa";
        const testData = {
            name: "aaa",
            text: "bbb",
            number: 100,
        };
        const firestoreInstance = admin.firestore();
        await firestoreInstance.doc(testPath).set(testData);
        const func = require("../src/functions/test");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testPath,
            },
            params: {},
        });
        expect(res).toStrictEqual(testData);
    });
    test("Notification test", async () => {
        const firestoreInstance = admin.firestore();
        const sourceCollectionPath = "unit/test/source";
        const userCollectionPath = "unit/test/user";
        const sourceUid = `sourceTestUid`;
        const sourceData = {
            uid: sourceUid,
            name: "event1",
            text: "eventtext"
        };
        const userDatas: { [key: string]: any }[] = [];
        const sourceUserDatas: { [key: string]: any }[] = [];
        for (let i = 0; i < 10; i++) {
            const userUid = `userTestUid${i}`;
            userDatas.push({
                uid: userUid,
                name: `user${i}`,
                text: `usertext${i}`,
                token: [
                    uuid(),
                    uuid(),
                ],
                number: i,
                enable: i % 2 === 0,                
            });
            sourceUserDatas.push({
                uid: userUid,
                source: firestoreInstance.doc(`${sourceCollectionPath}/${sourceUid}`),
                user: firestoreInstance.doc(`${userCollectionPath}/${userUid}`),
            });
        }
        await firestoreInstance.doc(`${sourceCollectionPath}/${sourceData.uid}`).set(sourceData);
        for (const userData of userDatas) {
            await firestoreInstance.doc(`${userCollectionPath}/${userData.uid}`).set(userData);
        }
        for (const sourceUserData of sourceUserDatas) {
            await firestoreInstance.doc(`${sourceCollectionPath}/${sourceData.uid}/user/${sourceUserData.uid}`).set(sourceUserData);
        }
        const func = require("../src/functions/send_notification");
        let wrapped = config.wrap(func([], {}, {}));
        let res = await wrapped({
            data: {
                title: "title",
                body: "body",
                data: {},
                channelId: "channelId",
                targetCollectionPath: `${sourceCollectionPath}/${sourceData.uid}/user`,
                targetTokenField: {
                    key: "user",
                    reference: {key: "token"},
                },
                responseTokenList: true,
            },
            params: {},
        });
        let expecedData: string[][][] = [];
        let splittedUserDatas = splitArray(userDatas, 500);
        for (let userDatas of splittedUserDatas) {
            const tokens: string[] = [];
            for (let userData of userDatas) {
                const sourceTokens = userData["token"] as string[];
                for (let t of sourceTokens) {
                    tokens.push(t);
                }
            }
            expecedData.push(splitArray([...new Set(tokens)], 500));
        }
        expect(res.results).toStrictEqual(expecedData);

        wrapped = config.wrap(func([], {}, {}));
        res = await wrapped({
            data: {
                title: "title",
                body: "body",
                data: {},
                channelId: "channelId",
                targetCollectionPath: `${sourceCollectionPath}/${sourceData.uid}/user`,
                targetTokenField: {
                    key: "user",
                    reference: {key: "token"},
                },
                targetConditions: [
                    {
                        key: "user",
                        value: [
                            {
                                type: "greaterThan",
                                key: "number",
                                value: 5,
                            },
                            {
                                type: "equalTo",
                                key: "enable",
                                value: true,
                            }
                        ]                        
                    }
                ],
                responseTokenList: true,
            },
            params: {},
        });
        expecedData = [];
        splittedUserDatas = splitArray(userDatas, 500);
        for (let userDatas of splittedUserDatas) {
            const tokens: string[] = [];
            for (let userData of userDatas) {
                if (userData["number"] <= 5 || userData["enable"] === false) {
                    continue;
                }
                const sourceTokens = userData["token"] as string[];
                for (let t of sourceTokens) {
                    tokens.push(t);
                }
            }
            expecedData.push(splitArray([...new Set(tokens)], 500));
        }
        expect(res.results).toStrictEqual(expecedData);
    }, 50000);
});
