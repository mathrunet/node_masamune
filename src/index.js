"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = void 0;
const admin = __importStar(require("firebase-admin"));
__exportStar(require("./functions"), exports);
/**
 * Methods for deploying to Firebase Functions.
 *
 * Firebase Functionsにデプロイするためのメソッドです。
 *
 * @param deployFunctions
 * The elements defined in [Functions] are passed as an array.
 *
 * The passed method is deployed. [Functions]で定義された要素を配列として渡します。渡されたメソッドがデプロイされます。
 */
function deploy(deployFunctions) {
    admin.initializeApp();
    for (const data of deployFunctions) {
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === data.id) {
            exports[data.id] = data.func;
        }
    }
}
exports.deploy = deploy;
