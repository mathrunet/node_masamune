import { WorkflowJobRunnerFunctionBase } from "../../src/lib/workflow_job_runner_function_base";

class TestJobRunner extends WorkflowJobRunnerFunctionBase {
    id = "test-job";

    actionPath(data: { [key: string]: any }): string {
        return this.getActionPath(data);
    }
}

describe("Workflow job request validation", () => {
    const runner = new TestJobRunner();

    it("returns a supplied action path", () => {
        expect(runner.actionPath({ path: "plugins/workflow/action/action-1" }))
            .toBe("plugins/workflow/action/action-1");
    });

    it.each([{}, { path: "" }, { path: null }])(
        "rejects a request without an action path",
        (data) => {
            expect(() => runner.actionPath(data)).toThrow(
                "Action path is required in request data",
            );
        },
    );
});
