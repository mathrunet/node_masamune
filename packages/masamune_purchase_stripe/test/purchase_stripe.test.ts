import * as admin from "firebase-admin";
import "@mathrunet/masamune";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");
