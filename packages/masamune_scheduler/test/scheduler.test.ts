import * as admin from "firebase-admin";
import { utils } from "@mathrunet/masamune";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("Firestore Test", () => {
    beforeAll(() => {
        admin.initializeApp();
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
                    utils.uuid(),
                    utils.uuid(),
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
        const func = require("@mathrunet/masamune_notification/src/functions/send_notification");
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
                    value: { key: "token" },
                },
                responseTokenList: true,
            },
            params: {},
        });
        let expecedData: string[][][] = [];
        let splittedUserDatas = utils.splitArray(userDatas, 500);
        for (let userDatas of splittedUserDatas) {
            const tokens: string[] = [];
            for (let userData of userDatas) {
                const sourceTokens = userData["token"] as string[];
                for (let t of sourceTokens) {
                    tokens.push(t);
                }
            }
            expecedData.push(utils.splitArray([...new Set(tokens)], 500));
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
                    value: { key: "token" },
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
        splittedUserDatas = utils.splitArray(userDatas, 500);
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
            expecedData.push(utils.splitArray([...new Set(tokens)], 500));
        }
        expect(res.results).toStrictEqual(expecedData);
    }, 50000);
    test("Notification scheduler test", async () => {
        const now = new Date();
        const schedulerCollectionPath = "unit/test/schedule";
        const firestoreInstance = admin.firestore();
        let uid = "notificationTestUid";
        let command = {
            "@command": "notification",
            "@private": {
                title: "title",
                text: "text",
                channelId: "channelId",
                targetToken: [utils.uuid(), utils.uuid()],
                responseTokenList: true,
            },
            "@public": {
                "_done": false,
                "_time": now.getTime(),
            },
            "@target": "command",
            "@type": "ModelServerCommandBase",
        };
        let doc = firestoreInstance.doc(`${schedulerCollectionPath}/${uid}`);
        await doc.set({
            "#command": command,
            "uid": uid,
            "_done": false,
            "_time": now.getTime(),
            "command": "notification",
        });
        const func = require("../src/functions/scheduler");
        let wrapped = config.wrap(func([], {}, { path: schedulerCollectionPath }));
        await wrapped({});
        let res = await doc.get();
        let data = res.data();
        expect(data!["_done"]).toBe(true);
        expect(data!["results"]).toEqual(JSON.stringify([command["@private"]["targetToken"]]));
    }, 50000);
    test("Copy document scheduler test", async () => {
        const now = new Date();
        const targetPath = "unit/test/target/copySourceUid";
        const schedulerCollectionPath = "unit/test/schedule";
        const firestoreInstance = admin.firestore();
        let uid = "notificationTestUid";
        let command = {
            "@command": "copy_document",
            "@private": {
                path: targetPath,
            },
            "@public": {
                "_done": false,
                "_time": now.getTime(),
            },
            "@target": "command",
            "@type": "ModelServerCommandBase",
        };
        let doc = firestoreInstance.doc(`${schedulerCollectionPath}/${uid}`);
        await doc.set({
            "#command": command,
            "command": "copy_document",
            "uid": uid,
            "_done": false,
            "_time": now.getTime(),
            "name": "aaa",
            "text": "bbb",
            "number": 100,
            "enable": false,
        });
        const func = require("../src/functions/scheduler");
        let wrapped = config.wrap(func([], {}, { path: schedulerCollectionPath }));
        await wrapped({});
        let res = await doc.get();
        let data = res.data();
        expect(data!["_done"]).toBe(true);
        res = await firestoreInstance.doc(targetPath).get();
        data = res.data();
        expect(data!["name"]).toEqual("aaa");
        expect(data!["text"]).toEqual("bbb");
        expect(data!["number"]).toEqual(100);
        expect(data!["number"]).toEqual(100);
        expect(data!["enable"]).toEqual(false);
    }, 50000);
    test("Delete documents scheduler test", async () => {
        const now = new Date();
        const firestoreInstance = admin.firestore();
        const sourceCollection = "unit/test/source";
        const sourceDatas: { [key: string]: any }[] = [];
        for (let i = 0; i < 10; i++) {
            const sourceUid = `sourceTestUid${i}`;
            const sourceData = {
                uid: sourceUid,
                name: `event${i}`,
                text: `eventtext${i}`,
                number: i,
            };
            sourceDatas.push(sourceData);
        }
        for (const sourceData of sourceDatas) {
            await firestoreInstance.doc(`${sourceCollection}/${sourceData.uid}`).set(sourceData);
        }
        const schedulerCollectionPath = "unit/test/schedule";
        let uid = "notificationTestUid";
        let command = {
            "@command": "delete_documents",
            "@private": {
                collectionPath: sourceCollection,
                wheres: [
                    {
                        type: "greaterThan",
                        key: "number",
                        value: 5,
                    }
                ],
            },
            "@public": {
                "_done": false,
                "_time": now.getTime(),
            },
            "@target": "command",
            "@type": "ModelServerCommandBase",
        };
        let doc = firestoreInstance.doc(`${schedulerCollectionPath}/${uid}`);
        await doc.set({
            "#command": command,
            "command": "delete_documents",
            "uid": uid,
            "_done": false,
            "_time": now.getTime(),
        });
        let col = await firestoreInstance.collection(sourceCollection).get();
        let d = col.docs.find((e) => e.id === "sourceTestUid4");
        expect(d).not.toBeUndefined();
        d = col.docs.find((e) => e.id === "sourceTestUid8");
        expect(d).not.toBeUndefined();
        const func = require("../src/functions/scheduler");
        let wrapped = config.wrap(func([], {}, { path: schedulerCollectionPath }));
        await wrapped({});
        let res = await doc.get();
        let data = res.data();
        expect(data!["_done"]).toBe(true);
        col = await firestoreInstance.collection(sourceCollection).get();
        d = col.docs.find((e) => e.id === "sourceTestUid4");
        expect(d).not.toBeUndefined();
        d = col.docs.find((e) => e.id === "sourceTestUid8");
        expect(d).toBeUndefined();
    }, 50000);
});
