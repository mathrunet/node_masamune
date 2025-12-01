import { ModelTimestamp } from "@mathrunet/masamune";
import * as admin from "firebase-admin";

/**
 * Workflow repeat type.
 * 
 * ワークフローの繰り返しタイプ。
 */
export const WorkflowRepeatList = ["none", "daily", "weekly", "monthly"] as const;

/**
 * Workflow repeat type.
 * 
 * ワークフローの繰り返しタイプ。
 */
export type WorkflowRepeat = (typeof WorkflowRepeatList)[number];

/**
 * Workflow status type.
 * 
 * ワークフローのステータスタイプ。
 */
export const WorkflowTaskStatusList = ["waiting", "running", "failed", "completed", "canceled"] as const;

/**
 * Workflow status type.
 * 
 * ワークフローのステータスタイプ。
 */
export type WorkflowTaskStatus = (typeof WorkflowTaskStatusList)[number];


/**
 * Workflow role type.
 * 
 * ワークフローのロールタイプ。
 */
export const WorkflowRoleList = ["admin", "editor", "viewer"] as const;

/**
 * Workflow role type.
 * 
 * ワークフローのロールタイプ。
 */
export type WorkflowRole = (typeof WorkflowRoleList)[number];

/**
 * Organization interface.
 * 
 * 組織のインターフェース。
 */
export interface Organization {
    "@uid": string;
    "@time": Date;
    "name"?: string;
    "description"?: string;
    "icon"?: string;
    "owner"?: admin.firestore.DocumentReference;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Member interface.
 * 
 * メンバーのインターフェース。
 */
export interface Member {
    "@uid": string;
    "@time": Date;
    "organization"?: admin.firestore.DocumentReference;
    "user"?: admin.firestore.DocumentReference;
    "role": WorkflowRole;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Project interface.
 * 
 * プロジェクトのインターフェース。
 */
export interface Project {
    "@uid": string;
    "@time": Date;
	"name"?: string;
	"description"?: string;
	"organization"?: admin.firestore.DocumentReference;
	"icon"?: string;
	"google_access_token"?: string;
	"google_refresh_token"?: string;
	"google_service_account"?: string;
	"github_personal_access_token"?: string;
	"appstore_issuer_id"?: string;
	"appstore_auth_key_id"?: string;
	"appstore_auth_key"?: string;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Workflow interface.
 * 
 * ワークフローのインターフェース。
 */
export interface Workflow {
	"@uid": string;
	"@time": Date;
	"name"?: string;
	"project"?: admin.firestore.DocumentReference;
	"organization"?: admin.firestore.DocumentReference;
    "repeat": WorkflowRepeat;
	"actions": ActionCommand[];
	"prompt"?: string;
	"materials"?: {[key: string]: any};
    "#nextTime"?: ModelTimestamp | admin.firestore.FieldValue;
	"nextTime"?: Date | admin.firestore.FieldValue;
    "#startTime"?: ModelTimestamp;
	"startTime"?: Date;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Task interface.
 * 
 * タスクのインターフェース。
 */
export interface Task {
	"@uid": string;
	"@time": Date;
	"workflow"?: admin.firestore.DocumentReference;
	"organization"?: admin.firestore.DocumentReference;
	"project"?: admin.firestore.DocumentReference;
	"status": WorkflowTaskStatus;
	"actions": ActionCommand[];
	"currentAction"?: admin.firestore.DocumentReference | admin.firestore.FieldValue;
	"nextAction"?: ActionCommand | admin.firestore.FieldValue;
	"error"?:  {[key: string]: any};
	"prompt"?: string;
	"materials"?: {[key: string]: any};
	"results"?: {[key: string]: any};
	"assets"?: {[key: string]: any};
    "search"?: string;
	"@search"?: admin.firestore.FieldValue;
	"usage": number;
    "#startTime"?: ModelTimestamp;
	"startTime"?: Date;
    "#finishedTime"?: ModelTimestamp;
	"finishedTime"?: Date;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Action interface.
 * 
 * アクションのインターフェース。
 */
export interface Action {
	"@uid": string;
	"@time": Date;
	"command": ActionCommand;
	"task"?: admin.firestore.DocumentReference;
	"workflow"?: admin.firestore.DocumentReference;
	"organization"?: admin.firestore.DocumentReference;
	"project"?: admin.firestore.DocumentReference;
	"status": WorkflowTaskStatus;
	"error"?: {[key: string]: any};
	"prompt"?: string;
	"materials"?: {[key: string]: any};
	"results"?: {[key: string]: any};
	"assets"?: {[key: string]: any};
	"usage": number;
    "search"?: string;
	"token"?: string;
    "#tokenExpiredTime"?: ModelTimestamp;
	"tokenExpiredTime"?: Date;
    "#startTime"?: ModelTimestamp;
	"startTime"?: Date;
    "#finishedTime"?: ModelTimestamp;
	"finishedTime"?: Date;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * ActionCommand interface.
 * 
 * アクションコマンドのインターフェース。
 */
export interface ActionCommand {
    "command": string;
    "index": number;   
    [key: string]: any; 
}

/**
 * Asset interface.
 * 
 * アセットのインターフェース。
 */
export interface Asset {
	"@uid": string;
	"@time": Date;
	"organization"?: admin.firestore.DocumentReference;
	"source"?: string;
	"content"?: string;
	"path"?: string;
	"mimtType"?: string;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Page interface.
 * 
 * ページのインターフェース。
 */
export interface Page {
    "@uid": string;
	"@time": Date;
	"organization"?: admin.firestore.DocumentReference;
	"project"?: admin.firestore.DocumentReference;
	"content"?: string;
	"path"?: string;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Usage interface.
 * 
 * 利用量のインターフェース。
 */
export interface Usage {
    "@uid": string;
	"@time": Date;
	"organization"?: admin.firestore.DocumentReference;
	"usage": number;
    "latestPlan"?: string;
    "bucketBalance"?: number;
    "lastCheckTime"?: admin.firestore.Timestamp;
    "currentMonth"?: string;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Plan interface.
 * 
 * プランのインターフェース。
 */
export interface Plan {
    "@uid": string;
	"@time": Date;
    "limit": number;
    "burst": number;
}

/**
 * Campaign interface.
 * 
 * キャンペーンのインターフェース。
 */
export interface Campaign {
    "@uid": string;
    "@time": Date;
    "organization"?: admin.firestore.DocumentReference;
    "limit"?: number;
    "#expiredTime"?: ModelTimestamp;
    "expiredTime"?: Date;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Certificate interface.
 * 
 * 証明書のインターフェース。
 */
export interface Certificate {
    "@uid": string;
    "@time": Date;
	"organization"?: admin.firestore.DocumentReference;
	"token"?: string;
	"scope"?: string[];
    "#expiredTime"?: ModelTimestamp;
	"expiredTime"?: Date;
    "#createdTime": ModelTimestamp;
    "createdTime": Date;
    "#updatedTime": ModelTimestamp;
    "updatedTime": Date;
}

/**
 * Subscription interface.
 * 
 * サブスクリプションのインターフェース。
 */
export interface Subscription {
    "userId": string;
    "expired": boolean;
    "expiredTime": number;
    "productId": string;
    [key: string]: any;
}