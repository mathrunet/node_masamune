import { Context, MiddlewareHandler } from "hono";
import { RulesEvaluationResult } from "./rules/rules_engine";

/**
 * Base class for rules adapter for Cloudflare Workers.
 *
 * Cloudflare Workers用のrulesアダプターのベースクラス。
 */
export abstract class WorkersRuleAdapterBase {
    /**
     * Create Hono middleware.
     *
     * Honoミドルウェアを作成します。
     */
    abstract build(): MiddlewareHandler;

    /**
     * Set rules evaluation result to context.
     *
     * rules評価結果をコンテキストに設定します。
     */
    protected setRulesContext(
        context: Context,
        result: RulesEvaluationResult,
    ): void {
        context.set("rules", result);
    }

    /**
     * Get rules evaluation result from context.
     *
     * コンテキストからrules評価結果を取得します。
     */
    protected getRulesContext(context: Context): RulesEvaluationResult | undefined {
        return context.get("rules") as RulesEvaluationResult | undefined;
    }
}
