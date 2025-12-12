import { ModelLocale, ModelRefBase, ModelTimestamp } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { WorkflowContext } from "./workflow_process_function_base";
import { Firestore } from "firebase-admin/firestore";

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
 * Task log phase type.
 * 
 * タスクログのフェーズタイプ。
 */
export type TaskLogPhase = "start" | "end" | "error" | "warning" | "info";

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
 * Model interface.
 * 
 * モデルのインターフェース。
 */
export interface Model {
    "@uid"?: string;
    "@time"?: Date;
}

/**
 * Organization interface.
 * 
 * 組織のインターフェース。
 */
export interface Organization extends Model {
    "name"?: string;
    "description"?: string;
    "icon"?: string;
    "owner"?: ModelRefBase;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Member interface.
 * 
 * メンバーのインターフェース。
 */
export interface Member extends Model {
    "organization"?: ModelRefBase;
    "user"?: ModelRefBase;
    "role": WorkflowRole;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Project interface.
 * 
 * プロジェクトのインターフェース。
 */
export interface Project extends Model {
    "name"?: string;
    "description"?: string;
    "concept"?: string;
    "goal"?: string;
    "target"?: string;
    "locale"?: ModelLocale | string;
    "kpi"?: { [key: string]: any };
    "organization"?: ModelRefBase;
    "icon"?: string;
    "google_access_token"?: string;
    "google_refresh_token"?: string;
    "google_service_account"?: string;
    "github_personal_access_token"?: string;
    "appstore_issuer_id"?: string;
    "appstore_auth_key_id"?: string;
    "appstore_auth_key"?: string;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Workflow interface.
 * 
 * ワークフローのインターフェース。
 */
export interface Workflow extends Model {
    "name"?: string;
    "project"?: ModelRefBase;
    "locale"?: ModelLocale | string;
    "organization"?: ModelRefBase;
    "repeat": WorkflowRepeat;
    "actions": ActionCommand[];
    "prompt"?: string;
    "materials"?: { [key: string]: any };
    "nextTime"?: ModelTimestamp | admin.firestore.FieldValue;
    "startTime"?: ModelTimestamp;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Task interface.
 * 
 * タスクのインターフェース。
 */
export interface Task extends Model {
    "workflow"?: ModelRefBase;
    "organization"?: ModelRefBase;
    "project"?: ModelRefBase;
    "locale"?: ModelLocale | string;
    "status": WorkflowTaskStatus;
    "actions": ActionCommand[];
    "currentAction"?: ModelRefBase | admin.firestore.FieldValue;
    "nextAction"?: ActionCommand | admin.firestore.FieldValue;
    "error"?: { [key: string]: any };
    "log"?: TaskLog[];
    "prompt"?: string;
    "materials"?: { [key: string]: any };
    "results"?: { [key: string]: any };
    "assets"?: { [key: string]: any };
    "search"?: string | admin.firestore.FieldValue;
    "@search"?: admin.firestore.FieldValue;
    "usage": number;
    "startTime"?: ModelTimestamp;
    "finishedTime"?: ModelTimestamp;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Task log interface.
 * 
 * タスクログのインターフェース。
 */
export interface TaskLog {
    "time": number;
    "message"?: string;
    "action": ActionCommand;
    "phase": TaskLogPhase;
    "data"?: { [key: string]: any };
}

/**
 * Action interface.
 * 
 * アクションのインターフェース。
 */
export interface Action extends Model {
    "command": ActionCommand;
    "task"?: ModelRefBase;
    "workflow"?: ModelRefBase;
    "organization"?: ModelRefBase;
    "project"?: ModelRefBase;
    "status": WorkflowTaskStatus;
    "locale"?: ModelLocale | string;
    "error"?: { [key: string]: any };
    "prompt"?: string;
    "log"?: TaskLog[];
    "materials"?: { [key: string]: any };
    "results"?: { [key: string]: any };
    "assets"?: { [key: string]: any };
    "usage": number;
    "search"?: string;
    "token"?: string;
    "tokenExpiredTime"?: ModelTimestamp;
    "startTime"?: ModelTimestamp;
    "finishedTime"?: ModelTimestamp;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
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
export interface Asset extends Model {
    "organization"?: ModelRefBase;
    "source"?: string;
    "content"?: string;
    "path"?: string;
    "mimtType"?: string;
    "locale"?: ModelLocale | string;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Page interface.
 * 
 * ページのインターフェース。
 */
export interface Page extends Model {
    "organization"?: ModelRefBase;
    "project"?: ModelRefBase;
    "content"?: string;
    "path"?: string;
    "locale"?: ModelLocale | string;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Usage interface.
 * 
 * 利用量のインターフェース。
 */
export interface Usage extends Model {
    "organization"?: ModelRefBase;
    "usage": number;
    "latestPlan"?: string | admin.firestore.FieldValue;
    "bucketBalance"?: number;
    "lastCheckTime"?: ModelTimestamp;
    "currentMonth"?: string;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Plan interface.
 * 
 * プランのインターフェース。
 */
export interface Plan extends Model {
    "limit": number;
    "burst": number;
}

/**
 * Campaign interface.
 * 
 * キャンペーンのインターフェース。
 */
export interface Campaign extends Model {
    "organization"?: ModelRefBase;
    "limit"?: number;
    "expiredTime"?: ModelTimestamp;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Certificate interface.
 * 
 * 証明書のインターフェース。
 */
export interface Certificate extends Model {
    "organization"?: ModelRefBase;
    "token"?: string;
    "scope"?: string[];
    "expiredTime"?: ModelTimestamp;
    "createdTime": ModelTimestamp;
    "updatedTime": ModelTimestamp;
}

/**
 * Subscription interface.
 * 
 * サブスクリプションのインターフェース。
 */
export interface Subscription extends Model {
    "userId": string;
    "expired": boolean;
    "expiredTime": number;
    "productId": string;
    [key: string]: any;
}
