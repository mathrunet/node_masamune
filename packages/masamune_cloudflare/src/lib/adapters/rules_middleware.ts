import { Context, MiddlewareHandler } from "hono";
import {
    RulesEngine,
    RulesEvaluationInput,
    RulesEvaluationResult,
} from "../src/rules/rules_engine";
import { WorkersAuthContext } from "../src/workers_auth_adapter_base";
import { WorkersRuleAdapterBase } from "../src/workers_rule_adapter_base";

/**
 * Input builder for rules adapter.
 *
 * rulesアダプター用の入力生成関数。
 */
export type RulesEvaluationInputBuilder = (
    context: Context,
) => RulesEvaluationInput | Promise<RulesEvaluationInput>;

/**
 * Options for RulesEngineRuleAdapter.
 *
 * RulesEngineRuleAdapterのオプション。
 */
export interface RulesEngineRuleOptions {
    /**
     * Rules engine to evaluate access rules.
     *
     * アクセスルールを評価するrulesエンジン。
     */
    engine: RulesEngine;

    /**
     * Builder that produces rules evaluation input from the request context.
     *
     * リクエストコンテキストからrules評価入力を生成するビルダー。
     */
    getEvaluationInput: RulesEvaluationInputBuilder;

    /**
     * Response returned when access is denied.
     *
     * アクセスが拒否された場合に返すレスポンス。
     */
    deniedResponse?: (
        context: Context,
        result: RulesEvaluationResult,
    ) => Response | Promise<Response>;
}

/**
 * Middleware adapter that evaluates rules using a RulesEngine.
 *
 * RulesEngineを用いてrulesを評価するミドルウェアアダプター。
 */
export class RulesEngineRuleAdapter extends WorkersRuleAdapterBase {
    constructor(options: RulesEngineRuleOptions) {
        super();
        this.options = options;
    }

    private readonly options: RulesEngineRuleOptions;

    build(): MiddlewareHandler {
        return async (context, next) => {
            const authentication = context.get("authentication") as WorkersAuthContext | undefined;
            const input = await this.options.getEvaluationInput(context);
            const result = await this.options.engine.evaluate({
                ...input,
                authentication: input.authentication ?? authentication,
            });
            if (!result.allowed) {
                return await this.denied(context, result);
            }
            this.setRulesContext(context, result);
            await next();
        };
    }

    private async denied(
        context: Context,
        result: RulesEvaluationResult,
    ): Promise<Response> {
        if (this.options.deniedResponse) {
            return await this.options.deniedResponse(context, result);
        }
        return context.json({
            error: "denied",
            rule: result.rulePath,
        }, 403);
    }
}
